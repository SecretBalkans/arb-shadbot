import { getChainInfoByApproxName, SimplifiedChainInfo } from './osmosis-registry/chainInfos';
import _ from 'lodash';
import { Logger } from '../utils';
import { DenomInfo } from './tokens';
import {Brand, Denom, DexProtocolName, Token} from "../executor/build-dex/dex/types/dex-types";

const logger = new Logger('IbcInfo');

export * from './osmosis-registry/chainInfos';
export * from './osmosis-registry/ibcAssets';
export type SecretContractAddress = Brand<string, 'ContractAddress'>;

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
  Persistence= 'Persistence',
  Quicksilver= 'Quicksilver',
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
  CHAIN.Persistence,
  CHAIN.Quicksilver,
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


