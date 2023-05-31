import {ArbWallet} from "../wallet/ArbWallet";
import {BalanceMonitor} from "../balances/BalanceMonitor";
import Aigle from "aigle";
import {ArbRunLog} from "./ArbRunLog";
import {ArbOperation} from "./aArbOperation";
import {ArbV1WinCost, IFailingArbInfo, SwapMoveOperationsType} from "./types";
import MoveIBC from "./MoveIBC";
import {CHAIN, getDexOriginChain} from "../ibc";
import {SwapOperation} from "./SwapOperation";
import {BalanceWaitOperation} from "./BalanceWaitOperation";
import {Logger} from "../utils";
import _ from "lodash";

export class ArbExecutor {
  public failedReason: IFailingArbInfo;
  private readonly logger: Logger;

  constructor(public readonly arb: ArbV1WinCost) {
    this.logger = new Logger(this.id);
  }

  get id() {
    return this.arb.id;
  }

  get reverseId() {
    return this.arb.reverseId;
  }

  async executeCurrentArb(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<void> {
    const operationsQ = await this.getOperationsQueue(balanceMonitor);
    // Print plan
    this.logger.log(operationsQ.map(p => p.toString()));
    await this.executeOperationsQ(operationsQ, arbWallet, balanceMonitor);
  }

  private async executeOperationsQ(operationsQ: ArbOperation<SwapMoveOperationsType>[], arbWallet: ArbWallet, balanceMonitor: BalanceMonitor) {
    await Aigle.findSeries(operationsQ, async op => {
      const result = await op.execute(arbWallet, balanceMonitor);
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
      fromChain: 'any',
      toChain: dexChain0,
      token: this.arb.token0,
      amount: this.arb.amountIn,
      amountMin: this.arb.amountIn.multipliedBy(this.arb.bridgeCost.dividedBy(this.arb.winUsd)),
    });
    if (!preparationPlan) {
      // Means we do not have funds on any chain
      return []
    }
    const swapPlan0 = [new SwapOperation({
      dex: this.arb.dex0,
      tokenSent: this.arb.token0,
      route: this.arb.route0,
      tokenReceived: this.arb.token1,
      tokenAmountIn: preparationPlan[preparationPlan.length - 1],
    }), dexChain0 !== CHAIN.Osmosis && new BalanceWaitOperation({
      token: this.arb.token1,
      isWrapped: dexChain0 === CHAIN.Secret,
      chain: dexChain0
    })];
    const bridgePlan = await moveIbc.createMoveIbcPlan({
      fromChain: dexChain0,
      toChain: dexChain1,
      token: this.arb.token1,
      amount: swapPlan0[0],
    })
    if (!bridgePlan) {
      return [];
    }
    const swapPlan1 = [
      new SwapOperation({
        dex: this.arb.dex1,
        tokenSent: this.arb.token1,
        route: this.arb.route1,
        tokenReceived: this.arb.token0,
        tokenAmountIn: bridgePlan[bridgePlan.length - 1],
      }),
      dexChain1 !== CHAIN.Osmosis && new BalanceWaitOperation({
        chain: dexChain1,
        token: this.arb.token0,
        isWrapped: dexChain1 === CHAIN.Secret,
      })
    ]
    return _.compact([
      ...preparationPlan,
      ...swapPlan0,
      ...bridgePlan,
      ...swapPlan1,
    ]);
  }

  markFailing(failReason: IFailingArbInfo) {
    this.failedReason = failReason;
    // TODO: mark so we do not attempt it all the time
  }
}
