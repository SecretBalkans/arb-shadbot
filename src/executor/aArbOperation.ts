import {
  Amount,
  FailReasons,
  IArbOperationExecuteResult,
  IFailingArbInfo,
  IOperationData,
  IOperationResult,
  SwapMoveOperationsType, SwapToken
} from './types';
import {Logger, safeJsonStringify} from '../utils';
import {ArbWallet} from '../wallet/ArbWallet';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import BigNumber from "bignumber.js";

export abstract class ArbOperation<T extends SwapMoveOperationsType> {
  private _result: { success: boolean; result: IArbOperationExecuteResult<T>; };

  abstract type(): string;

  abstract id(): string;

  logger: Logger;

  protected constructor(public readonly data: IOperationData<T>, protected readonly shouldLogInDetails: boolean = true) {
    this.logger = new Logger(this.toString());
  }

  toString(): string {
    return `OP-${this.type()}-${this.id()}`;
  }

  public execute<B extends boolean>(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: B, result: B extends true ? IOperationResult<T> : IFailingArbInfo }>;
  public async execute<B extends boolean>(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: B, result: IArbOperationExecuteResult<T> }> {
    try {
      if (this._result) {
        return this._result as { success: B, result: IArbOperationExecuteResult<T> };
      }
      this._result = await this.executeInternal(arbWallet, balanceMonitor);
      return this._result as { success: B, result: IArbOperationExecuteResult<T> };
    } catch (err) {
      return {
        success: false,
        result: {
          internal: safeJsonStringify(err),
          data: err.message as string,
          reason: FailReasons.Unhandled
        }
      } as { success: B, result: IArbOperationExecuteResult<T> }
    }
  }

  protected abstract executeInternal<B extends boolean>(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: B, result: B extends true ? IOperationResult<T> : IFailingArbInfo }>;
  protected abstract executeInternal<B extends boolean>(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: B, result: IArbOperationExecuteResult<T> }>;

  getResult<B extends boolean>(): { success: B, result: B extends true ? IOperationResult<T> : IFailingArbInfo } | null;
  getResult(): { success: boolean, result: IArbOperationExecuteResult<T> } | null {
    return this._result;
  }
}

export abstract class ArbOperationSequenced<T extends SwapMoveOperationsType> extends ArbOperation<T> {
  protected constructor(public readonly data: IOperationData<T>, protected readonly shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
  }

  protected async resolveArbOperationAmount({amount, token}: {
    amount: BigNumber | ArbOperation<SwapMoveOperationsType>,
    token: SwapToken,
  }, arbWallet, balanceMonitor): Promise<Amount | IFailingArbInfo> {
    let resolvedAmount, arbOperation;
    if (BigNumber.isBigNumber(amount)) {
      resolvedAmount = amount;
    } else {
      arbOperation = await amount.execute(arbWallet, balanceMonitor);
      resolvedAmount = arbOperation.success ? arbOperation.result.amount : new BigNumber(arbOperation.result?.internal || 0);
    }
    if ((arbOperation && !arbOperation?.success) || resolvedAmount.isEqualTo(0)) {
      return arbOperation.result;
    }
    return resolvedAmount;
  }
}
