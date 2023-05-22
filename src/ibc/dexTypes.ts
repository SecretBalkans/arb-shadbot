import { Brand } from '../ts';
import BigNumber from 'bignumber.js';

export type Amount = BigNumber;
export type CoinAmount = BigNumber;
export type DexProtocolName = 'osmosis' | 'shade';
export type IBCHash = Brand<string, 'IBCHash'>;

export type Token = Brand<string, 'Token'>;
export type Denom = Brand<string, 'Denom'>;
export type NonArbedToken = Brand<string, 'NonArbedToken'>
export type NoIBCToken = Brand<string, 'NoIBCToken'>
export type PoolToken = Token | NonArbedToken | NoIBCToken;
export enum SwapToken {
  SHD = 'SHD',
  'USDC' = 'USDC',
  'USDT' = 'USDT',
  CMST = 'CMST',
  SILK = 'SILK',
  stkdSCRT = 'stkdSCRT',
  SCRT = 'SCRT',
  stATOM = 'stATOM',
  IST = 'IST',
  ATOM = 'ATOM',
  stOSMO = 'stOSMO',
  stINJ = 'stINJ',
  INJ = 'INJ',
  OSMO = 'OSMO',
  JUNO = 'JUNO',
  stJUNO = 'stJUNO',
  BLD = 'BLD',
  stkATOM = 'stkATOM',
}

// noinspection JSUnusedLocalSymbols
export function isSwapToken(token: string): token is SwapToken {
  return !!SwapTokenMap[token as Token];
}

export const SwapTokenMap: Record<SwapToken, Token> = {
  [SwapToken.SHD]: 'SHD' as Token,
  [SwapToken.SILK]: 'SILK' as Token,
  [SwapToken.CMST]: 'CMST' as Token,
  [SwapToken.stkdSCRT]: 'stkdSCRT' as Token,
  [SwapToken.SCRT]: 'SCRT' as Token,
  [SwapToken.stATOM]: 'stATOM' as Token,
  [SwapToken.IST]: 'IST' as Token,
  [SwapToken.ATOM]: 'ATOM' as Token,
  [SwapToken.stOSMO]: 'stOSMO' as Token,
  [SwapToken.USDT]: 'USDT' as Token,
  [SwapToken.USDC]: 'USDC' as Token,
  [SwapToken.OSMO]: 'OSMO' as Token,
  [SwapToken.JUNO]: 'JUNO' as Token,
  [SwapToken.stJUNO]: 'stJUNO' as Token,
  [SwapToken.BLD]: 'BLD' as Token,
  [SwapToken.INJ]: 'INJ' as Token,
  [SwapToken.stINJ]: 'stINJ' as Token,
  [SwapToken.stkATOM]: 'stkATOM' as Token
};
