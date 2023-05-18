import { Brand } from '../ts';
import BigNumber from 'bignumber.js';

export type Amount = BigNumber;
export type CoinAmount = BigNumber;
export type DexProtocolName = 'osmosis' | 'shade';

export type Token = Brand<string, 'Token'>;
export type Denom = Brand<string, 'Denom'>;
export type NonArbedToken = Brand<string, 'NonArbedToken'>
export type NoIBCToken = Brand<string, 'NoIBCToken'>
export type PoolToken = Token | NonArbedToken | NoIBCToken;
export enum SwapToken {
  // SHD = 'SHD',
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
}

// noinspection JSUnusedLocalSymbols
export function isSwapToken(token: string): token is SwapToken {
  return !!SwapTokenMap[token as Token];
}

export const SwapTokenMap: Record<SwapToken, Token> = {
  // SHD: SwapToken.SHD as Token,
  SILK: SwapToken.SILK as Token,
  CMST: SwapToken.CMST as Token,
  stkdSCRT: SwapToken.stkdSCRT as Token,
  SCRT: SwapToken.SCRT as Token,
  stATOM: SwapToken.stATOM as Token,
  IST: SwapToken.IST as Token,
  ATOM: SwapToken.ATOM as Token,
  stOSMO: SwapToken.stOSMO as Token,
  USDT: SwapToken.USDT as Token,
  USDC: SwapToken.USDC as Token,
  OSMO: SwapToken.OSMO as Token,
  JUNO: SwapToken.JUNO as Token,
  stJUNO: SwapToken.stJUNO as Token,
  BLD: SwapToken.BLD as Token,
  INJ: SwapToken.INJ as Token,
  stINJ: SwapToken.stINJ as Token
};
