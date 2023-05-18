import {ArbV1} from "../monitorGqlClient";
import {ArbWallet} from "../wallet/ArbWallet";
import {BalanceMonitor} from "../balances/BalanceMonitor";
import Aigle from "aigle";
import {ArbRunLog} from "./ArbRunLog";
import {ArbOperation} from "./aArbOperation";
import {IFailingArbInfo, SwapMoveOperationsType} from "./types";
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
      if (!result.success) {
        this.markFailing(result.result as IFailingArbInfo);
      }
      return !result.success; // exit on first error
    });
  }

  getRunLog() {
    return new ArbRunLog();
  }

  private async getOperationsQueue(balanceMonitor: BalanceMonitor):
    Promise<ArbOperation<SwapMoveOperationsType>[]> {
    const moveIbc = new MoveIBC(balanceMonitor);
    const dexChain0 = getDexOriginChain(this.arb.dex0);
    const dexChain1 = getDexOriginChain(this.arb.dex1);
    const preparationPlan = await moveIbc.createMoveIbcPlan({
      originChain: 'any',
      toChain: dexChain0,
      token: this.arb.token0,
      amount: this.arb.amountIn,
      amountMin: this.arb.amountIn.multipliedBy(this.arb.bridgeCost.dividedBy(this.arb.winUsd)),
    });
    if (!preparationPlan) {
      // Means we do not have funds on any chain
      return []
    }
    let swapOperation0 = new SwapOperation({
      dex: this.arb.dex0,
      swapTokenSent: this.arb.token0,
      expectedReturn: undefined, // TODO: provide calculation fn to be called with amount internally
      route: this.arb.route0,
      swapTokenReceived: this.arb.token1,
      tokenAmountIn: preparationPlan[preparationPlan.length - 1],
    });
    const bridgePlan = await moveIbc.createMoveIbcPlan({
      originChain: dexChain0,
      toChain: dexChain1,
      token: this.arb.token1,
      amount: swapOperation0,
    })
    if (!bridgePlan) {
      return [];
    }
    return [
      ...preparationPlan,
      swapOperation0,
      ...bridgePlan,
      new SwapOperation({
        dex: this.arb.dex1,
        swapTokenSent: this.arb.token1,
        route: this.arb.route1,
        expectedReturn: undefined, // TODO: provide calculation fn to be called with amount internally
        swapTokenReceived: this.arb.token0,
        tokenAmountIn: bridgePlan[bridgePlan.length - 1],
      }),
    ];
  }

  markFailing(failReason: IFailingArbInfo) {
    this.failedReason = failReason;
    // TODO: mark so we do not attempt it all the time
  }
}
