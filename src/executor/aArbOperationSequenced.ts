import {Amount, IFailingArbInfo, IOperationData, SwapMoveOperationsType, SwapToken} from "./types";
import BigNumber from "bignumber.js";
import {ArbOperation} from "./aArbOperation";

export abstract class AArbOperationSequenced<T extends SwapMoveOperationsType> extends ArbOperation<T> {
  protected constructor(public readonly data: IOperationData<T>, protected readonly shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
  }

  protected async resolveArbOperationAmount({amount, token}: {
    amount: BigNumber | ArbOperation<SwapMoveOperationsType>,
    token: SwapToken,
  }, arbWallet, balanceMonitor): Promise<Amount | IFailingArbInfo> {
    let resolvedAmount;
    let arbOperation;
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
