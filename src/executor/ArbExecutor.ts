import {ArbV1} from "../monitorGqlClient";
import {ArbWallet} from "../wallet/ArbWallet";
import {BalanceMonitor} from "../balances/BalanceMonitor";
import Aigle from "aigle";
import {ArbRunLog} from "./ArbRunLog";
import {ArbOperation} from "./aArbOperation";
import {IFailingArbInfo, SwapBridgeOperationsType} from "./types";
import MoveIBC from "./MoveIBC";
import {getDexOriginChain} from "../ibc";
import {SwapOperation} from "./SwapOperation";
import {BridgeOperation} from "./BridgeOperation";
import {BalanceWaitOperation} from "./BalanceWaitOperation";

export class ArbExecutor {
  public failedReason: IFailingArbInfo;
  constructor(public readonly arb: ArbV1) {
  }

  get id() {
    return this.arb.id;
  }

  async execute(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<void> {
    const operationsQ = await this.getOperationsQueue(balanceMonitor);
    await Aigle.findSeries(operationsQ, async op => {
      let result = await op.execute(arbWallet, balanceMonitor);
      if(!result.success) {
        this.markFailing(result.result as IFailingArbInfo);
      }
      return !result.success; // exit on first error
    });
  }
  getRunLog() {
    return new ArbRunLog();
  }

  private async getOperationsQueue(balanceMonitor: BalanceMonitor): Promise<ArbOperation<SwapBridgeOperationsType>[]> {
    const moveIbc = new MoveIBC(balanceMonitor);
    const dexChain = getDexOriginChain(this.arb.dex0);
    const preparationPlan = await moveIbc.createMoveIbcPlan({
      originChain: 'any',
      toChain: dexChain,
      token: this.arb.token0,
      amount: this.arb.amountIn,
      amountMin: this.arb.amountIn.multipliedBy(this.arb.bridgeCost.dividedBy(this.arb.winUsd)),
    });
    if (!preparationPlan) {
      // Means we do not have funds on any chain
      return []
    }
    const dex1Chain = getDexOriginChain(this.arb.dex1);
    return [
      ...preparationPlan,
      new SwapOperation({
        dex: this.arb.dex0,
        swapTokenSent: this.arb.token0,
        expectedReturn: this.arb.amountBridge,
        route: this.arb.route0,
        swapTokenReceived: this.arb.token1,
        token0Amount: preparationPlan[preparationPlan.length - 1],
      }),
      new BridgeOperation({
        from: dexChain,
        to: dex1Chain,
        amount: this.arb.amountBridge,
        token: this.arb.token0,
      }),
      new BalanceWaitOperation({
        chain: dex1Chain,
        token: this.arb.token0,
      }),
      new SwapOperation({
        dex: this.arb.dex1,
        swapTokenSent: this.arb.token1,
        expectedReturn: this.arb.amountIn,
        route: this.arb.route0,
        swapTokenReceived: this.arb.token0,
        token0Amount: preparationPlan[preparationPlan.length - 1],
      }),
    ];
  }

  markFailing(failReason: IFailingArbInfo) {
    this.failedReason = failReason;
    // TODO: mark so we do not attempt it all the time
  }
}
