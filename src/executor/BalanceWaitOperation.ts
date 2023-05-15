import {
  BalanceWaitOperationType, IArbOperationExecuteResult,
  IOperationData,

} from './types';
import {ArbWallet} from '../wallet/ArbWallet';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {SwapTokenMap} from '../ibc/dexTypes';
import {MAX_IBC_FINISH_WAIT_TIME_DEFAULT} from './MoveIBC';
import {ArbOperation} from './aArbOperation';

export class BalanceWaitOperation extends ArbOperation<BalanceWaitOperationType> {
  constructor(data: IOperationData<BalanceWaitOperationType>, shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean; result: IArbOperationExecuteResult<BalanceWaitOperationType> }> {
    const t = Date.now();
    const amountOrFalse = await balanceMonitor.waitForChainBalanceUpdate(this.data.chain, this.data.token, {
      maxWaitTime: MAX_IBC_FINISH_WAIT_TIME_DEFAULT
    })
    return amountOrFalse ? {
      success: true,
      result: {
        amount: amountOrFalse,
        timeMs: Date.now() - t
      }
    } : {
      success: false,
      result: null
    }
  }

  id(): string {
    return `${this.data.chain}.${SwapTokenMap[this.data.token]}`;
  }

  type(): string {
    return 'BalanceWait';
  }
}
