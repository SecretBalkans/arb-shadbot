import { getChainInfoByApproxName, SimplifiedChainInfo } from './osmosis-registry/chainInfos';
import _ from 'lodash';
import { Brand } from '../ts';
import { Logger } from '../utils';
import { Denom, DexProtocolName, Token } from './dexTypes';
import { DenomInfo } from './tokens';

const logger = new Logger('IbcInfo');

export * from './dexTypes';
export * from './osmosis-registry/chainInfos';
export * from './osmosis-registry/ibcAssets';

export enum CHAIN {
  Osmosis = 'Osmosis',
  Stride = 'Stride',
  Secret = 'Secret',
  Injective = 'Injective',
  Axelar = 'Axelar',
  Juno = 'Juno',
  Cosmos = 'Cosmos',
  Agoric= 'Agoric',
  Comdex= 'Comdex',
}

export const SUPPORTED_CHAINS: CHAIN[] = [
  CHAIN.Osmosis,
  CHAIN.Stride,
  CHAIN.Secret,
  CHAIN.Comdex,
  CHAIN.Injective,
  CHAIN.Axelar,
  CHAIN.Juno,
  CHAIN.Agoric,
  CHAIN.Cosmos,
];



const SUPPORTED_CHAINS_INFO_MAP: Partial<Record<CHAIN, SimplifiedChainInfo>> = _.zipObject(SUPPORTED_CHAINS, SUPPORTED_CHAINS.map(getChainInfoByApproxName));

export function getChainByChainId (chainId: string): CHAIN | undefined {
  const supportedChainOrNull = _.findKey(SUPPORTED_CHAINS_INFO_MAP, {chainId});
  return CHAIN[supportedChainOrNull]
}

export function getChainInfo(chain: CHAIN): SimplifiedChainInfo {
  const chainInfo = SUPPORTED_CHAINS_INFO_MAP[chain];
  if (!chainInfo) {
    logger.debugOnce(`No supported chain info for chain=${chain}`);
    throw new Error(`ChainInfo not found for chain=${chain}`)
  }
  return chainInfo;
}
const dexOriginChains: Record<DexProtocolName, CHAIN> = { osmosis: CHAIN.Osmosis, shade: CHAIN.Secret };
export function getDexOriginChain(dex: DexProtocolName) {
  return dexOriginChains[dex];
}
export function getTokenDenomInfo(token: Token, isWrapped = false): DenomInfo {
  for (let otherChain of SUPPORTED_CHAINS) {
    const otherChainInfo = getChainInfo(otherChain);
    let curr = otherChainInfo.currencies.find(d => {
      return token === d.coinDenom.replace('-',''); // stkd-SCRT > stkdSCRT
    });
    if (curr) {
      return {
        isWrapped,
        token,
        chainDenom: curr.coinMinimalDenom as Denom,
        chainId: otherChainInfo.chainId,
        decimals: curr.coinDecimals,
      };
    }
  }
}

export type SecretContractAddress = Brand<string, 'ContractAddress'>;

