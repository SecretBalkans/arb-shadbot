import {
  Amount,
  FailReasons,
  IArbOperationExecuteResult,
  IFailingArbInfo,
  IOperationData,
  IOperationResult,
  SwapMoveOperationsType,
  SwapToken
} from './types';
import {Logger, safeJsonStringify} from '../utils';
import {ArbWallet} from '../wallet/ArbWallet';
import {BalanceMonitor} from '../balances/BalanceMonitor';

export abstract class ArbOperation<T extends SwapMoveOperationsType> {
  private _result: { success: boolean; result: IArbOperationExecuteResult<T>; };

  abstract type(): string;

  abstract id(): string;

  abstract toJSON(): any;

  logger: Logger;

  protected constructor(public readonly data: IOperationData<T>, protected readonly shouldLogInDetails: boolean = true) {
    this.logger = new Logger(this.toString());
  }

  toString(): string {
    const dataParamsJSON = this.toJSON();
    return `OP-${this.type()}-${this.id()}${dataParamsJSON ? `-${typeof dataParamsJSON === "string" ? dataParamsJSON : JSON.stringify(dataParamsJSON)}` : ''}`;
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
