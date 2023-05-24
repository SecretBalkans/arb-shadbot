import BigNumber from 'bignumber.js';
import {CHAIN} from '../ibc';
import {ArbOperation} from './aArbOperation';
import {
  Amount,
  DexProtocolName,
  SwapToken,
  ArbV1,
  Route, ArbV1Raw,
} from './build-dex/dexSdk';

export * from '../executor/build-dex/dex/types/dex-types';

export type SwapOperationType = 'swap';
export type IBCOperationType = 'ibc';
export type BalanceWaitOperationType = 'waitBalance';
export type BalanceCheckOperationType = 'balanceCheck';
export type SecretSNIPOperationType = 'secretSNIP';
export type SwapMoveOperationsType = SwapOperationType | MoveOperationType;
export type MoveOperationType = IBCOperationType | BalanceWaitOperationType | BalanceCheckOperationType | SecretSNIPOperationType;
export type IOperationData<T extends SwapMoveOperationsType> =
  T extends 'swap' ? SwapOperationData
    : T extends 'ibc' ? IBCOperationData
      : T extends 'waitBalance' ? BalanceWaitOperationData
        : T extends 'secretSNIP' ? SecretSNIPOperationData
        : BalanceCheckOperationData;
export type IOperationResult<T extends SwapMoveOperationsType> =
  T extends 'swap' ? SwapOperationResult
    : T extends 'ibc' ? IBCOperationResult
      : T extends 'waitBalance' ? BalanceWaitOperationResult
        : T extends 'secretSNIP' ? SecretSNIPOperationResult
        : BalanceCheckOperationResult;

export type IbcMoveAmount = Amount | 'max';
export type IBCMoveCHAIN = CHAIN | 'any';
export type IArbOperationExecuteResult<T extends SwapMoveOperationsType> = IOperationResult<T> | IFailingArbInfo;

export enum FailReasons {
  NoBalance = 'no balance',
  MinAmount = 'min amount',
  Unhandled = 'unhandled error',
  IBC='ibc exception',
}

export interface IFailingArbInfo {
  reason: FailReasons;
  message?: string;
  internal?: any;
  data: string;
}

export type SwapOperationData = {
  tokenSent: SwapToken,
  tokenAmountIn: Amount | ArbOperation<SwapMoveOperationsType>,
  tokenReceived: SwapToken,
  dex: DexProtocolName,
  route: Route<DexProtocolName>
};

export interface AmountOperationResult {
  amount: Amount;
}

export interface SwapOperationResult extends AmountOperationResult {
}

export interface IBCOperationData {
  from: CHAIN,
  to: CHAIN,
  amount: Amount | ArbOperation<SwapMoveOperationsType>,
  token: SwapToken
  isWrapped?: boolean
}

export interface IBCOperationResult extends AmountOperationResult{
}


export interface BalanceCheckOperationData extends BalanceWaitOperationData {
  amountMin: BigNumber;
  amountMax: IbcMoveAmount | ArbOperation<SwapMoveOperationsType>;
}

export interface BalanceCheckOperationResult extends AmountOperationResult {
}

export interface BalanceWaitOperationData {
  chain: CHAIN;
  token: SwapToken;
  isWrapped: boolean;
}

export interface BalanceWaitOperationResult extends AmountOperationResult {
  timeMs: number;
}

export interface SecretSNIPOperationData {
  token: SwapToken;
  amount: Amount | ArbOperation<MoveOperationType>,
  unwrap?: true;
  wrap?: true;
}

export interface SecretSNIPOperationResult extends AmountOperationResult {
  isWrapped: boolean | 'both';
}

export interface ArbV1WinRaw extends ArbV1Raw {
  amount_win: number;
}

export interface ArbV1Win extends ArbV1<BigNumber> {
  amountWin: BigNumber;
}

export interface ArbV1WinCost extends ArbV1Win {
  bridgeCost: BigNumber;
  winUsd: BigNumber;
}
