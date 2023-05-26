import {
  BalanceWaitOperationType,
  FailReasons,
  IArbOperationExecuteResult,
  IOperationData,
  SwapTokenMap,
} from './types';
import {ArbWallet} from '../wallet/ArbWallet';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {MAX_IBC_FINISH_WAIT_TIME_DEFAULT} from './MoveIBC';
import {ArbOperation} from './aArbOperation';
import BigNumber from "bignumber.js";
import _ from "lodash";

export class BalanceWaitOperation extends ArbOperation<BalanceWaitOperationType> {
  private readonly uid: string;
  constructor(data: IOperationData<BalanceWaitOperationType>, shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
    this.uid = _.uniqueId();
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean; result: IArbOperationExecuteResult<BalanceWaitOperationType> }> {
    const t = Date.now();
    const amountOrFalse = await balanceMonitor.waitForChainBalanceUpdate(this.data.chain, this.data.token, {
      isWrapped: this.data.isWrapped,
      maxWaitTime: MAX_IBC_FINISH_WAIT_TIME_DEFAULT
    })
    let timeMs = Date.now() - t;
    return amountOrFalse ? {
      success: true,
      result: {
        amount: amountOrFalse,
        timeMs: timeMs
      }
    } : {
      success: false,
      result: {
        timeMs: timeMs,
        amount: BigNumber(0),
        reason: FailReasons.IBC,
        message: `Timeout ${timeMs} waiting for transfer ${this.data.isWrapped ? 's' : ''}${this.data.token} on ${this.data.chain}`
      }
    }
  }

  id(): string {
    return `${this.data.chain}_${this.data.isWrapped ? '(wrapped).' : ''}${SwapTokenMap[this.data.token]}`;
  }

  type(): string {
    return 'BalanceWait';
  }

  override toString(): string {
    // BalanceWait is the lowest in the stack so we override
    // it's toJSON to equal it's toSTRING()
    // as it is a basic operation at the end of every other operation toString()
    return this.toJSON();
  }

  toJSON() {
    return `${this.type()}_${this.id()}_#${this.uid}`;
  }
}
