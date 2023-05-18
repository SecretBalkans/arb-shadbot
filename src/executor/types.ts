import {Amount, DexProtocolName, SwapToken} from '../ibc';
import BigNumber from 'bignumber.js';
import {CHAIN} from '../ibc';
import {ArbOperation} from './aArbOperation';


export type SwapOperationType = 'swap';
export type BridgeOperationType = 'bridge';
export type BalanceWaitOperationType = 'waitBalance';
export type BalanceCheckOperationType = 'balanceCheck';
export type SecretSNIPOperationType = 'secretSNIP';
export type SwapMoveOperationsType = SwapOperationType | MoveOperationType;
export type MoveOperationType = BridgeOperationType | BalanceWaitOperationType | BalanceCheckOperationType | SecretSNIPOperationType;
export type IOperationData<T extends SwapMoveOperationsType> =
  T extends 'swap' ? SwapOperationData
    : T extends 'bridge' ? BridgeOperationData
      : T extends 'waitBalance' ? BalanceWaitOperationData
        : T extends 'secretSNIP' ? SecretSNIPOperationData
        : BalanceCheckOperationData;
export type IOperationResult<T extends SwapMoveOperationsType> =
  T extends 'swap' ? SwapOperationResult
    : T extends 'bridge' ? BridgeOperationResult
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
  swapTokenSent: SwapToken,
  tokenAmountIn: Amount | ArbOperation<SwapMoveOperationsType>,
  expectedReturn: Amount, // TODO: should calculate internally based on swaps if not provided explicitly
  swapTokenReceived: SwapToken,
  dex: DexProtocolName,
  route: any
};

export interface AmountOperationResult {
  amount: Amount;
}

export interface SwapOperationResult extends AmountOperationResult {
}

export interface BridgeOperationData {
  from: CHAIN,
  to: CHAIN,
  amount: Amount | ArbOperation<SwapMoveOperationsType>,
  token: SwapToken
}

export interface BridgeOperationResult extends AmountOperationResult{
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
  isWrapped: boolean;
}
