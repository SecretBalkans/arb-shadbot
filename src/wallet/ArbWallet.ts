import {DirectSecp256k1HdWallet, DirectSecp256k1Wallet, Registry} from '@cosmjs/proto-signing';
import {defaultRegistryTypes, SigningStargateClient} from '@cosmjs/stargate';
import fs from 'fs';
import {AccountData, AminoSignResponse, StdSignDoc} from 'secretjsbeta/dist/wallet_amino';

import {Secp256k1Pen} from './Secp256k1Pen';
import {Secp256k1Wallet, StdSignature} from '@cosmjs/launchpad';
import {Bip39, EnglishMnemonic, Slip10, Slip10Curve, stringToPath} from '@cosmjs/crypto';
import {fromBase64, MsgExecuteContract, SecretNetworkClient} from 'secretjsbeta';

import {SignDoc} from 'secretjsbeta/dist/protobuf/cosmos/tx/v1beta1/tx';
import {serializeSignDoc, serializeStdSignDoc} from './signUtils';
import _ from 'lodash';

import {CHAIN, getChainByChainId, getChainInfo, getTokenDenomInfo, SecretContractAddress} from '../ibc';
import {DenomInfo} from '../ibc/tokens';
import {Amount, Denom, IBCHash, isSwapToken, SwapToken, SwapTokenMap, Token} from '../ibc';
import {CosmWasmClient} from '@cosmjs/cosmwasm-stargate';
import {fetchTimeout, Logger} from '../utils';
import {initPairsRaw, initTokens} from '../ibc/shade-resgistry/shadeRest';
import {getShadeTokenBySymbol} from '../ibc/shade-resgistry/tokens';
import {convertCoinFromUDenomV2, convertCoinToUDenomV2, makeIBCMinimalDenom} from '../utils/denoms';
import {Brand} from '../ts';
import Aigle from 'aigle';
import BigNumber from 'bignumber.js';
import path from 'path';
import {loadSync} from 'protobufjs';
import {SerializedBalanceUpdate} from '../balances/BalanceMonitor';
import {accountFromAnyStrideSupport} from './customAccountParser';
import {ArbWalletConfig} from './types';
import InjectiveClient from "./clients/InjectiveClient";

const logger = new Logger('ArbWallet');

export const swapTypeUrlOsmo = '/osmosis.gamm.v1beta1.MsgSwapExactAmountIn';


export function getChainUrl(chain: CHAIN, rest = false) {
  const chainInfo = getChainInfo(chain);
  return chainInfo ? rest ? chainInfo.rest : chainInfo.rpc : null;
}

type IBCChannel = Brand<string, 'IBCChannel'>;
export type IBCResource = { channelId: string, chain: CHAIN, maxClockDrift: number };

export class ArbWallet {
  public readonly config: ArbWalletConfig;
  private readonly CODE_HASH_CACHE = {};
  private readonly CONTRACT_MSG_CACHE = {};
  private secretClient: SecretNetworkClient;
  private readonly rpcClients: any = {};
  private readonly restClients: any = {};
  private readonly wallets: any = {};
  private readonly wasmClients: any = {};
  public ibcInfo: Partial<Record<CHAIN, Partial<Record<CHAIN, IBCChannel>>>> = {};
  private readonly counterpartyChannelIds: Partial<Record<CHAIN, {
    channelId: string,
    counterpartyChannelId: string,
  }[]>>;
  private readonly betaChannelApiChains: any = [];
  counterpartyChains: Partial<Record<CHAIN, Record<IBCChannel, CHAIN | string>>> = {};
  logger: Logger = new Logger('ArbWallet');
  mapOfZonesData: any[];
  private isFetchingSecret: Boolean;

  public async initSecretRegistry() {
    await Promise.all([
      initTokens(),
      initPairsRaw(),
    ]);
  }

  constructor(config: ArbWalletConfig, public readonly supportedChains: CHAIN[]) {
    this.config = config;
    if (!this.config.mnemonic && !this.config.privateHex) {
      throw new Error(`Config ./.secrets.js should contain valid cosmos: { privateHex: "i.e. keplr private hex string" } OR cosmos: { mnemonic: "space separated words" }`);
    }
  }

  public async getBalance(chain: CHAIN, asset: SwapToken, {
    rawAssetDecimals = 0,
    safe = true,
    retrying = false,
    suffix = '0',
  } = {}): Promise<Amount | -1> {
    if (chain === CHAIN.Secret && asset !== SwapToken.SCRT) {
      const secretToken = this.getSecretAddress(asset);
      return this.getSecretBalance(secretToken);
    }
    let tokenDenomInfo;
    try {
      tokenDenomInfo = getTokenDenomInfo(SwapTokenMap[asset]);
    } catch (err) {
      if (err.message.includes('not implemented') && safe) {
        return -1;
      } else {
        throw err;
      }
    }
    const decimals = getTokenDenomInfo(SwapTokenMap[asset])?.decimals;
    const denom = tokenDenomInfo.denom;
    if (denom.includes(':')) {
      /* if (denom.startsWith('cw20') && chain === CHAIN.Juno) {
         const junoWasmClient = await this.getWasmClient(chain);
         const contractAddress = denom.split(':')[1];
         const receiver = await this.getAddress(chain);
         const { balance } = await junoWasmClient.queryContractSmart(contractAddress, {
           balance: {
             address: receiver,
           },
         });
         return +balance / (10 ** decimals);
       }*/
      throw new Error(`${asset} on ${chain} = ${denom} balance check not implemented`);
    } else {
      const receiver = await this.getAddress(chain, suffix);
      let receiverBalance;
      const rpcClient = await this.getClient(chain, false, suffix);
      await Promise.race([
        new Promise<void>(resolve => setTimeout(() => {
          // cleanupClient(chain, false);
          rpcClient.getBalance(receiver, tokenDenomInfo).then((balance) => {
            receiverBalance = balance;
            resolve();
          });
        }, 15000)),
        (async () => {
          try {
            receiverBalance = await rpcClient.getBalance(receiver, tokenDenomInfo);
          } catch (err) {
            if (!retrying) {
              await new Promise(resolve => setTimeout(resolve, 3000));
              return this.getBalance(chain, asset, {retrying: true});
            }
          }
        })(),
      ]);
      if (!receiverBalance) {
        throw new Error(`Get balance timeout on ${chain} for ${tokenDenomInfo}`);
      }
      try {
        return receiverBalance ? convertCoinFromUDenomV2(receiverBalance.amount, rawAssetDecimals || decimals) : BigNumber(0);
      } catch (err) {
        console.error('Error', err, 'Will continue');
        return BigNumber(0);
      }
    }
  }

  async getWasmClient(chain: CHAIN): Promise<CosmWasmClient> {
    if (!this.wasmClients[chain]) {
      this.wasmClients[chain] = await CosmWasmClient.connect(getChainUrl(chain));
    }
    return this.wasmClients[chain];
  }

  async getWallet(chain: CHAIN, pathSuffix = '0'): Promise<DirectSecp256k1HdWallet | DirectSecp256k1Wallet> {
    const chainInfo = getChainInfo(chain);
    this.wallets[pathSuffix] = this.wallets[pathSuffix] || {};
    const chainBech32Prefix = chainInfo.bech32Config;
    if (!chainBech32Prefix) {
      throw new Error(`Cannot get wallet on chain ${chain}`);
    }
    this.wallets[pathSuffix][chain] = this.wallets[pathSuffix][chain] || await this.setupWallet(chain, pathSuffix);
    return this.wallets[pathSuffix][chain];
  }


  async getClient(chain: CHAIN, rest = false, suffix = '0'): Promise<SigningStargateClient> {
    const rpc = getChainUrl(chain, rest);
    let container = rest ? this.restClients : this.rpcClients;
    container[suffix] = container[suffix] || {};
    let swapRegistry = [];
    switch (chain) {
      case CHAIN.Osmosis:
        const OsmoMsgSwap = loadSync(path.join(__dirname, 'proto/osmosis.proto')).lookupType('MsgSwapExactAmountIn');
        swapRegistry = [[swapTypeUrlOsmo, OsmoMsgSwap]];
        break;
      default:
        break;
    }
    const CosmWasmMsgExecuteContract = loadSync(path.join(__dirname, 'proto/cosmwasm.tx.proto')).lookupType('MsgExecuteContract');
    const cosmWasmExecuteContractTypeUrl = '/cosmwasm.wasm.v1.MsgExecuteContract';
    const cosmWasmSwapRegistry = [[cosmWasmExecuteContractTypeUrl, CosmWasmMsgExecuteContract]];

    container[suffix][chain] = container[suffix][chain] || await SigningStargateClient.connectWithSigner(
      rpc,
      await this.getWallet(chain, suffix),
      {
        registry: new Registry([...defaultRegistryTypes, ...swapRegistry, ...cosmWasmSwapRegistry]),
        accountParser: accountFromAnyStrideSupport,
      },
    );
    return container[suffix][chain];
  }

  private getPrivateKey() {
    return Buffer.from(this.config.privateHex, 'hex');
  }

  async setupWallet(
    chain: CHAIN,
    pathSuffix = '0',
  ) {
    const {bech32Config, bip44: {coinType}} = getChainInfo(chain);
    const mnemonic = this.config.mnemonic;
    if (mnemonic) {
      let parsedMnemonic = mnemonic;
      try {
        parsedMnemonic = Buffer.from(fromBase64(mnemonic)).toString('utf-8');
      } catch {
      }
      return await DirectSecp256k1HdWallet.fromMnemonic(parsedMnemonic, {
        hdPaths: [stringToPath(`m/44'/${coinType}'/${pathSuffix.includes('/') ? pathSuffix : `0'/0/${pathSuffix}`}`)],
        prefix: bech32Config,
      });
    } else {
      const privateKey = this.getPrivateKey();
      let uint8arr = new Uint8Array(privateKey);
      return await DirectSecp256k1Wallet.fromKey(uint8arr, bech32Config);
    }
  }

  public async setupAminoWallet(
    bech32prefix: string,
    coinType = 118,
    pathSuffix: '0',
  ): Promise<Secp256k1Wallet> {
    const mnemonic = this.config.mnemonic;
    if (mnemonic) {
      let parsedMnemonic = mnemonic;
      try {
        parsedMnemonic = Buffer.from(fromBase64(mnemonic)).toString('utf-8');
      } catch {
      }
      const mnemonicChecked = new EnglishMnemonic(parsedMnemonic);
      const seed = await Bip39.mnemonicToSeed(mnemonicChecked);
      const path = stringToPath(`m/44'/${coinType}'/${pathSuffix.includes('/') ? pathSuffix : `0'/0/${pathSuffix}`}`);
      const {privkey} = Slip10.derivePath(Slip10Curve.Secp256k1, seed, path);
      return await Secp256k1Wallet.fromKey(privkey, bech32prefix);
    } else {
      const privateKey = this.getPrivateKey();
      let uint8arr = new Uint8Array(privateKey);
      return await Secp256k1Wallet.fromKey(uint8arr, bech32prefix);
    }
  }

  public async getSecretPen(): Promise<Secp256k1Pen> {
    const mnemonic = this.config.mnemonic;
    if (mnemonic) {
      let parsedMnemonic = mnemonic;
      try {
        parsedMnemonic = Buffer.from(fromBase64(mnemonic)).toString('utf-8');
      } catch {
      }
      return await Secp256k1Pen.fromMnemonic(parsedMnemonic);
    } else {
      const privateKey = this.getPrivateKey();
      let uint8arr = new Uint8Array(privateKey);
      return await Secp256k1Pen.fromKey(uint8arr);
    }
  }

  public async getSecretSigner() {
    let pen = await this.getSecretPen();
    return async (bytes: Uint8Array): Promise<StdSignature> => {
      return pen.sign(bytes);
    };
  };

  public async getSecretNetworkClient(url?: string, chain: CHAIN = CHAIN.Secret): Promise<SecretNetworkClient> {
    url = url || getChainInfo(chain).rest;
    if (!this.secretClient) {
      const senderAddress = await this.getAddress(chain);
      const signer = await this.getSecretSigner();
      const getSecretPen = this.getSecretPen.bind(this);
      this.secretClient = new SecretNetworkClient({
        url: url,
        wallet: {
          async signAmino(
            signerAddress: string,
            signDoc: StdSignDoc,
          ): Promise<AminoSignResponse> {

            const accounts = await this.getAccounts();
            if (!accounts.find(a => a.address === signerAddress)) {
              throw new Error(`Address ${signerAddress} not found in wallet`);
            }

            const signature = await signer(serializeStdSignDoc(signDoc));

            return {
              signed: {
                ...signDoc,
              },
              signature: signature,
            };
          },
          async signDirect(signerAddress: string, signDoc: SignDoc): Promise<{
            readonly signed: SignDoc;
            readonly signature: StdSignature;
          }> {
            const accounts = await this.getAccounts();
            if (!accounts.find(a => a.address === signerAddress)) {
              throw new Error(`Address ${signerAddress} not found in wallet`);
            }

            const signature = await signer(await serializeSignDoc(signDoc));
            return {
              signed: {
                ...signDoc,
              },
              signature,
            };
          },
          async getAccounts(): Promise<readonly AccountData[]> {
            return [
              {
                address: senderAddress,
                algo: 'secp256k1',
                pubkey: (await getSecretPen()).pubkey,
              },
            ];
          },
        },
        chainId: getChainInfo(chain).chainId,
        walletAddress: senderAddress,
      });
    }

    return this.secretClient;
  }

  public async getAddress(chain: CHAIN, suffix = '0'): Promise<string> {
    if (chain === CHAIN.Injective) {
      const injClient = new InjectiveClient({mnemonic: this.config.mnemonic, privateHex: this.config.privateHex});
      return injClient.publicAddress.address;
    }
    const wallet = await this.setupWallet(chain, suffix);
    const [firstAccount] = await wallet.getAccounts();
    return firstAccount.address;
  }

  /**
   * Gets the secret balance of an asset by address and decimals to pass.
   * TODO: just pass decimals and handle SNIP-20/SNIP-25 by querying token info and fetching the decimals
   @param asset.address string
   @param asset.decimals number
   @param asset.codeHash? string
   * */
  public async getSecretBalance(asset: { address: SecretContractAddress, codeHash?: string, decimals: number }, noViewingKeySet = false): Promise<Amount> {
    const client = await this.getSecretNetworkClient();
    const result = await this.querySecretContract(asset.address, {
      balance: {
        key: this.config.secretNetworkViewingKey,
        address: client.address,
      },
    }, asset.codeHash) as any;
    if (!noViewingKeySet && (_.isString(result) && result.includes('"unauthorized"')) || result.viewing_key_error?.msg === 'Wrong viewing key for this address or viewing key not set') {
      let tx = await this.executeSecretContract({
        contractAddress: asset.address, msg: {
          set_viewing_key: {
            key: this.config.secretNetworkViewingKey,
          },
        }, gasPrice: 0.0175, gasLimit: 175_000, waitForCommit: false
      });
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        let amount = await this.getSecretBalance(asset, true);
        if (amount) {
          return amount;
        }
      }
      this.logger.log('ViewingKey', tx.rawLog);
      return this.getSecretBalance(asset);
    }
    return result?.balance?.amount ? convertCoinFromUDenomV2(result?.balance?.amount, asset.decimals) : null;
  }

  /**
   * Query a secret smart contract by address and by passing a msg
   * @param contractAddress string The address of the contract to query
   * @param msg object A JSON object that will be passed to the contract as a query
   * @param codeHash optional for faster resolution
   * @param useResultCache allow caching of result. Useful if querying static blockchain data
   */
  public async querySecretContract<T extends object, R extends any>(contractAddress: SecretContractAddress, msg: T, codeHash?: string, useResultCache = false) {
    const client = await this.getSecretNetworkClient();
    if (codeHash || !this.CODE_HASH_CACHE[contractAddress]) {
      this.CODE_HASH_CACHE[contractAddress] = (await client.query.compute.codeHashByContractAddress({contract_address: contractAddress})).code_hash;
    }
    let cached;
    const cacheKey = `${contractAddress}.${Object.getOwnPropertyNames(msg)[0]}`;
    if (useResultCache && (cached = _.get(this.CONTRACT_MSG_CACHE, cacheKey))) {
      return cached;
    }
    const result = await client.query.compute.queryContract<T, R>({
      code_hash: codeHash || this.CODE_HASH_CACHE[contractAddress],
      contract_address: contractAddress,
      query: msg,
    });
    if (result) {
      if (useResultCache) {
        _.set(this.CONTRACT_MSG_CACHE, cacheKey, result);
      }
      this.CODE_HASH_CACHE[contractAddress] = this.CODE_HASH_CACHE[contractAddress] || codeHash;
      return result;
    }
  }

  /**
   * Broadcast a handle/execute tx/msg to a secret smart contract by address, wait for execution and return result.
   * @param contractAddress The address of the contract to submit a tx to
   * @param msg A JSON object that will be passed to the contract as a handle msg
   * @param gasPrice
   * @param gasLimit
   * @param waitForCommit
   * @param sentFunds: {denom:string,amount:string}[]
   */
  public async executeSecretContract({
                                       contractAddress,
                                       msg,
                                       gasPrice = 0.015,
                                       gasLimit = 1700000,
                                       waitForCommit = true,
                                       sentFunds = []
                                     }: { contractAddress: string, msg: any, gasPrice?: number, gasLimit?: number, waitForCommit?: boolean, sentFunds?: BalancesRaw }) {
    const client = await this.getSecretNetworkClient();
    if (!this.CODE_HASH_CACHE[contractAddress]) {
      this.CODE_HASH_CACHE[contractAddress] = (await client.query.compute.codeHashByContractAddress({
        contract_address: contractAddress,
      })).code_hash;
    }

    return await client.tx.broadcast([new MsgExecuteContract({
      contract_address: contractAddress,
      code_hash: this.CODE_HASH_CACHE[contractAddress],
      sender: client.address,
      msg,
      ...(sentFunds.length ? {sent_funds: sentFunds.map(({denom, amount}) => ({denom, amount}))} : {})
    })], {
      waitForCommit,
      gasLimit,
      gasPriceInFeeDenom: gasPrice,
      feeDenom: 'uscrt',
    });
  }

  public getSecretAddress(asset: SwapToken): { address: SecretContractAddress, codeHash: string, decimals: number } {
    const shadeToken = getShadeTokenBySymbol(SwapTokenMap[asset]);
    return {
      address: shadeToken.contract_address,
      decimals: shadeToken.decimals,
      codeHash: shadeToken.code_hash,
    };
  }

  async getBalancesOnChain(chain: CHAIN, suffix = '0'): Promise<BalanceMap> {
    await this.initIBCInfoCache();
    let secretBalances: TokenBalanceWithDenomInfo[] = [];
    const rpcClient = await this.getClient(chain, false, suffix);
    const address = await this.getAddress(chain, suffix);
    if (chain === CHAIN.Secret) {
      if (this.isFetchingSecret) {
        return; // exit early while fetching early to avoid duplicating tasks
      } else {
        this.isFetchingSecret = true;
        secretBalances = _.compact(await Aigle.mapSeries(Object.keys(SwapTokenMap), async (swapToken) => {
          let token = SwapTokenMap[swapToken];
          let secretTokenInfo = this.getSecretAddress(token);
          try {
            let balance = await this.getSecretBalance(secretTokenInfo);
            return {token: SwapTokenMap[swapToken], denomInfo: getTokenDenomInfo(token, true), amount: balance}
          } catch (err) {
            this.logger.debugOnce(err.message);
            return null
          }
        }));
        this.isFetchingSecret = false;
      }
    }
    const balancesRaw = await rpcClient.getAllBalances(address);
    return new BalanceMap(chain, [...secretBalances, ...this.parseTokenBalances(chain, balancesRaw as BalancesRaw)]);
  }

  parseTokenBalances(chain: CHAIN, balancesRaw: BalancesRaw): TokenBalanceWithDenomInfo[] {
    const parsedBalances: ParsedTokenBalance[] = _.map(balancesRaw, this.parseBalance.bind(this, chain)).filter((d: ParsedTokenBalance) => {
      return isSwapToken(d?.token);
    });
    return this.constructTokenBalanceMapWithDenomInfo(parsedBalances);
  }

  private constructTokenBalanceMapWithDenomInfo(parsedBalances: ParsedTokenBalance[]) {
    return _.map(parsedBalances, (b) => {
      return {
        token: SwapToken[b.token],
        amount: b.amount,
        denomInfo: getTokenDenomInfo(b.token),
      };
    });
  }

  parseBalance(chain: CHAIN, {
    denom,
    amount,
  }: { denom: Denom, amount: string }): ParsedTokenBalance {
    let amountParsed: Amount;
    const chainInfo = this.getDenomInfoOnChain(denom, chain);
    if (chainInfo) {
      amountParsed = convertCoinFromUDenomV2(amount, chainInfo.decimals);
      return {
        amount: amountParsed,
        token: chainInfo.token as Token,
        denom: chainInfo.chainDenom,
        rawAmount: amount,
      };
    }
  }

  async getChannelCounterpartyChain(chain: CHAIN, channelId: string, portId: string = 'transfer'): Promise<{ chain_id }> {
    if (!_.get(this.counterpartyChains, `${chain}${channelId}`)) {
      const restUrl = getChainInfo(chain).rest;
      const isBetaApi = this.betaChannelApiChains.includes(chain);
      const connectionRestUrl = `${restUrl}/ibc/core/channel${isBetaApi ? `/v1beta1` : '/v1'}/channels/${channelId}/ports/${portId}/client_state`;
      const response = await fetchTimeout(connectionRestUrl);
      if (!response || response.message) {
        logger.debugOnce(`${chain} ${response.message} ${restUrl}`);
        this.betaChannelApiChains.push(chain);
        return this.getChannelCounterpartyChain(chain, channelId, portId);
      }
      this.counterpartyChains[chain] = this.counterpartyChains[chain] || {};
      this.counterpartyChains[chain][channelId] = response?.identified_client_state.client_state;
    }
    return this.counterpartyChains[chain][channelId];
  }

  async getChannelCounterpartyChannelId(chain: CHAIN, channelId: string) {
    if (!this.counterpartyChannelIds[chain]) {
      const rpcUrl = getChainInfo(chain).rest;
      const isBetaApi = this.betaChannelApiChains.includes(chain);
      const channelsRpcUrl = `${rpcUrl}/ibc/core/channel/${isBetaApi ? `/v1beta1` : '/v1'}/channels?pagination.limit=2000`;
      const response = await fetchTimeout(channelsRpcUrl);
      if (!response || response.message) {
        this.betaChannelApiChains.push(chain);
        return this.getChannelCounterpartyChannelId(chain, channelId);
      }
      this.counterpartyChannelIds[chain] = response?.channels?.map(c => ({
        channelId: c.channel_id,
        counterpartyChannelId: c.counterparty?.channel_id,
      }));
    }
    return _.find(this.counterpartyChannelIds[chain], {channelId})?.counterpartyChannelId;
  }

  getTransferChannelId(sourceChain: CHAIN, destinationChain: CHAIN): IBCChannel | undefined {
    return this.ibcInfo[sourceChain][destinationChain];
  }

  private async fetchChannelGroups(chain: CHAIN, skip = 0): Promise<Record<CHAIN, IBCResource[]>> {
    const restUrl = getChainInfo(chain).rest;
    const channelsRpcUrl = `${restUrl}/ibc/core/channel/v1/channels?pagination.limit=3000`;
    try {
      let {channels} = await fetchTimeout(channelsRpcUrl, {}, 30000);
      const map = await Aigle.mapLimit(
        _.filter(channels, ({
                              channel_id,
                              port_id,
                            }) => port_id === 'transfer'),
        5,
        async ({
                 channel_id,
                 port_id,
                 /*, state, version*/
               }) => {
          const info = await this.getChannelCounterpartyChain(chain, channel_id, port_id);
          return ({
            channelId: channel_id,
            // path is transfer/channel-X  = portId = transfer and channel-X is channelId to resolve the counterparty chain
            chain: getChainByChainId(info.chain_id) || info.chain_id,
          });
        });
      // this.ibcInfo[chain] = _.zipObject(_.map(map, 'chain'), map);
      return _.groupBy(map, 'chain') as any;
    } catch (err) {
      logger.debugOnce(`Load ibc cache error chain = ${chain}: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return await this.fetchChannelGroups(chain, skip);
    }
  }

  async initIBCInfoCache() {
    let allChainChannelGroups: Partial<Record<CHAIN, IBCChannel[]>> = {};
    await this.initMapOfZonesCache();
    if (await Aigle.someSeries(this.supportedChains, async (chain) => {
      return new Promise<boolean>(resolve => {
        const fsCachePath = this.getFsCachePath(chain);
        fs.readFile(fsCachePath, (err, data) => {
          if (err || !data) {
            this.logger.debugOnce(`IBC Info will be reloaded. Chain ${chain} is missing`);
            resolve(true);
          } else {
            allChainChannelGroups[chain] = JSON.parse(Buffer.from(data).toString('utf-8'));
            resolve(false);
          }
        });
      });
    })) {
      allChainChannelGroups = _.fromPairs(await Aigle.mapLimit(this.supportedChains, 5, async (chain) => {
        const pick = _(await this.fetchChannelGroups(chain)).pick(this.supportedChains).toPairs().map(([chain, ibcs]) => [chain, _.map(ibcs, 'channelId')]).fromPairs().value();
        fs.writeFileSync(this.getFsCachePath(chain), JSON.stringify(pick), {encoding: 'utf-8'});
        return [chain, pick];
      }));
      this.logger.log('IBC info reloaded for all clients.')
    }

    this.ibcInfo = _(allChainChannelGroups).toPairs().map(([chain, chainChannelGroup]) => {
      const chainInfo = getChainInfo(chain as CHAIN);
      return [chain, _(chainChannelGroup).toPairs().map(([otherChain, channelIds]) => {
        const maxChannel = _.maxBy(channelIds, channelId => {
          const otherChainId = getChainInfo(otherChain as CHAIN);
          const channelMapOfZonesData = _.find(this.mapOfZonesData, {
            channel_id: channelId,
            zone: chainInfo.chainId,
            zone_counterparty: otherChainId.chainId,
          });
          return (channelMapOfZonesData?.ibc_tx_success_rate || 0) * channelMapOfZonesData?.ibc_cashflow_in; // pick most successful highest cashflow
        });
        if (!maxChannel) {
          this.logger.debugOnce(`Error choosing channel between ${chain}-${otherChain} from ${channelIds}`.red);
        }
        return [otherChain, maxChannel];
      }).fromPairs().value()];
    }).fromPairs().value() as any;
  }

  public makeIBCHash(token: Token, chain: CHAIN): IBCHash {
    const tokenDenomInfo = getTokenDenomInfo(token, false);
    let destinationChain = getChainByChainId(tokenDenomInfo.chainId);
    if (destinationChain === chain) {
      return tokenDenomInfo.chainDenom as string as IBCHash;
    } else {
      return makeIBCMinimalDenom(this.getTransferChannelId(chain, destinationChain), tokenDenomInfo.chainDenom)
    }
  }

  private async initMapOfZonesCache() {
    let mapOfZonesData;
    try {
      mapOfZonesData = JSON.parse(Buffer.from(fs.readFileSync(path.resolve(path.join(__dirname, `fscache/mapOfZones.json`)))).toString('utf-8'));
    } catch {
      let success_rate_limit = 45;
      let timeframe = 168; // or 720
      let chainIds = this.supportedChains.map((chain) => getChainInfo(chain).chainId);
      this.logger.log('MapOfZones will reload cache')
      const query = `query {
ft_channels_stats (
  order_by: {
    channel_id:desc
    zone: desc
    zone_counterparty:desc
    ibc_tx_success_rate: desc
  }
  where: {
    timeframe: {_eq: ${timeframe} }
    zone: {_in: ${JSON.stringify(chainIds)} }
    zone_counterparty: {_in: ${JSON.stringify(chainIds)} }
  is_zone_counterparty_mainnet:{_eq:true}
  is_opened:{_eq:true}
  ibc_tx_success_rate:{_gt: ${success_rate_limit}}
  }) {
  channel_id
  ibc_tx_success_rate
  timeframe
  ibc_tx_failed
  ibc_tx
  ibc_tx_pending
  ibc_cashflow_in
  ibc_cashflow_out
  zone
  zone_counterparty
  is_opened
}
}
`;
      mapOfZonesData = await fetchTimeout('https://api2.mapofzones.com/v1/graphql', {
        'headers': {
          'content-type': 'application/json',
        },
        'body': JSON.stringify({query, variables: null}),
        'method': 'POST',
      });
      if (mapOfZonesData.errors) {
        this.logger.debugOnce(`MapOfZones error ${JSON.stringify(mapOfZonesData)} ${JSON.stringify({body: query}, null, 2)}`.red);
        throw new Error(`MapOfZones fetch error`);
      }
      mapOfZonesData = mapOfZonesData.data.ft_channels_stats
      fs.writeFileSync(path.resolve(path.join(__dirname, `fscache/mapOfZones.json`)), JSON.stringify(mapOfZonesData), 'utf8');
      this.logger.log('MapOfZones cache reloaded')
    }
    this.mapOfZonesData = mapOfZonesData;
    return this.mapOfZonesData;
  }

  private getFsCachePath(chain: string) {
    return path.resolve(path.join(__dirname, `fscache/${chain}`));
  }

  private getDenomInfoOnChain(denom: Denom, chain: CHAIN): DenomInfo | undefined {
    if (denom.startsWith('gamm')) {
      return;
    }
    if (!denom.startsWith('ibc/')) {
      const chainInfo = getChainInfo(chain);
      let curr = chainInfo.currencies.find(d => {
        return denom === d.coinMinimalDenom;
      });
      if (curr) {
        return {
          token: curr.coinDenom as Token,
          chainDenom: curr.coinMinimalDenom as Denom,
          decimals: curr.coinDecimals,
          chainId: chainInfo.chainId,
        };
      } else {
        this.logger.debugOnce(`Unhandled denom ${denom} on ${chain}`);
      }
    }
    for (let otherChain of this.supportedChains) {
      if (otherChain === chain) {
        continue;
      }
      let channelId = this.getTransferChannelId(chain, otherChain);
      if (channelId) {
        const otherChainInfo = getChainInfo(otherChain);
        let curr = otherChainInfo.currencies.find(d => {
          return denom as string === makeIBCMinimalDenom(channelId, d.coinMinimalDenom) as string;
        });
        if (curr) {
          return {
            token: curr.coinDenom as Token,
            chainDenom: curr.coinMinimalDenom as Denom,
            chainId: otherChainInfo.chainId,
            decimals: curr.coinDecimals,
          };
        }
      }
    }
  }
}

export type BalancesRaw = {
  denom: Denom,
  amount: string
}[]

type ParsedTokenBalance = { denom: string, token: Token, amount: Amount, rawAmount: string };

export type TokenBalanceWithDenomInfo = { token: SwapToken, amount: Amount, denomInfo: DenomInfo };

export type SerializedBalances = { token: string, amount: string, denomInfo: DenomInfo }[];

export class BalanceMap {
  tokenBalances: TokenBalanceWithDenomInfo[] = [];

  constructor(public readonly chain: CHAIN, tokenBalances: TokenBalanceWithDenomInfo[]) {
    this.tokenBalances = tokenBalances;
  }

  static fromSerializedUpdate(balanceUpdate: SerializedBalanceUpdate): BalanceMap {
    return new BalanceMap(balanceUpdate.chain, balanceUpdate.balances.map((balance) => {
      return {
        ...balance,
        token: SwapTokenMap[balance.token],
        amount: convertCoinFromUDenomV2(balance.amount, balance.denomInfo.decimals),
      };
    }))
  }


  toJSON(): SerializedBalances {
    return this.tokenBalances.map(({token, amount, denomInfo}) => ({
      denomInfo,
      amount: convertCoinToUDenomV2(amount, denomInfo.decimals).toString(),
      token: SwapTokenMap[token],
    }));
  }

  toString(): string {
    return JSON.stringify(
      _.zipObject(
        this.tokenBalances.map(t => `${t.denomInfo.isWrapped ? 's' : ''}${t.token}`),
        this.tokenBalances.map(({amount}) => amount.toString()))
      , null, 4);
  }

  public diff(pastBalanceMap?: BalanceMap): BalanceMap {
    const newBalancesRaw = _.compact(_.map(this.tokenBalances, ({
                                                                  amount,
                                                                  token,
                                                                  denomInfo: {
                                                                    isWrapped,
                                                                    decimals,
                                                                    chainDenom
                                                                  },
                                                                }) => {
      const pastBalance = _.find(pastBalanceMap?.tokenBalances, {denomInfo: {isWrapped}, token});
      const diffAmount = pastBalance ? BigNumber(amount).minus(pastBalance.amount) : amount;
      return !diffAmount.isEqualTo(0) ? {
        chainDenom: chainDenom,
        isWrapped,
        token,
        amount: diffAmount,
      } : null;
    }));
    _.forEach(pastBalanceMap?.tokenBalances, ({denomInfo: {chainDenom, isWrapped}, token, amount}) => {
      if (!_.find(this.tokenBalances, {token, denomInfo: {chainDenom: chainDenom, isWrapped}})) {
        // if we do not have the past denom, then add it with a - indicating it dissapeared
        newBalancesRaw.push({chainDenom: chainDenom, token, amount: amount.multipliedBy(-1), isWrapped});
      } else {
        // do nothing as we have already subtracted amounts that we have
      }
    });

    return new BalanceMap(this.chain, newBalancesRaw.map(({amount, isWrapped, token}) => ({
      denomInfo: getTokenDenomInfo(SwapTokenMap[token], isWrapped),
      amount,
      token
    })));
  }


  updateBalances(balanceUpdate: SerializedBalanceUpdate) {
    _.forEach(balanceUpdate.balances, ({token, denomInfo, amount}) => {
      let tokenInBalance = _.find(this.tokenBalances, {
        token,
        denomInfo: {isWrapped: denomInfo.isWrapped}
      }) as TokenBalanceWithDenomInfo;
      if (tokenInBalance) {
        tokenInBalance.amount = convertCoinFromUDenomV2(amount, denomInfo.decimals);
      } else {
        this.tokenBalances.push({
          denomInfo,
          token: SwapTokenMap[token],
          amount: convertCoinFromUDenomV2(amount, denomInfo.decimals)
        })
      }
    });
  }
}
