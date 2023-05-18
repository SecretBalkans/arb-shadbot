import {Amount, DexProtocolName, SwapToken} from '../ibc/dexTypes';
import BigNumber from 'bignumber.js';
import {CHAIN} from '../ibc';
import {ArbOperation} from './aArbOperation';

export type SwapOperationType = 'swap';
export type BridgeOperationType = 'bridge';
export type BalanceWaitOperationType = 'waitBalance';
export type BalanceCheckOperationType = 'balanceCheck';
export type SwapBridgeOperationsType = SwapOperationType | MoveOperationType;
export type MoveOperationType = BridgeOperationType | BalanceWaitOperationType | BalanceCheckOperationType;
export type IOperationData<T extends SwapBridgeOperationsType> =
  T extends 'swap' ? SwapOperationData
    : T extends 'bridge' ? BridgeOperationData
      : T extends 'waitBalance' ? BalanceWaitOperationData
        : BalanceCheckOperationData;
export type IOperationResult<T extends SwapBridgeOperationsType> =
  T extends 'swap' ? SwapOperationResult
    : T extends 'bridge' ? BridgeOperationResult
      : T extends 'waitBalance' ? BalanceWaitOperationResult
        : BalanceCheckOperationResult;

export type IbcMoveAmount = BigNumber | 'max';
export type IBCMoveCHAIN = CHAIN | 'any';
export type IArbOperationExecuteResult<T extends SwapBridgeOperationsType> = IOperationResult<T> | IFailingArbInfo;

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
  swapTokenSent: SwapToken,
  token0Amount: ArbOperation<MoveOperationType>,
  expectedReturn: Amount,
  swapTokenReceived: SwapToken,
  dex: DexProtocolName,
  route: any
};

export type SwapOperationResult = {
  token1ReturnAmount: Amount,
};

export interface BridgeOperationData {
  from: CHAIN,
  to: CHAIN,
  amount: Amount | ArbOperation<MoveOperationType>,
  token: SwapToken
}

export interface BridgeOperationResult {
  amount: Amount;
}


export interface BalanceCheckOperationData extends BalanceWaitOperationData {
  amountMin: BigNumber;
  amountMax: IbcMoveAmount;
}

export interface BalanceCheckOperationResult {
  amount: Amount;
}

export interface BalanceWaitOperationData {
  chain: CHAIN;
  token: SwapToken;
}

export interface BalanceWaitOperationResult extends BalanceCheckOperationResult {
  timeMs: number;
}
