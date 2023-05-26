import _ from 'lodash';
import {CHAIN, getChainByChainId, getDexOriginChain, getTokenDenomInfo} from '../ibc';
import {Prices} from '../prices/prices';
import {ArbWallet} from '../wallet/ArbWallet';
import {Logger} from '../utils';
import {getGasFeeInfo} from './utils';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {ArbRunLog} from "./ArbRunLog";
import {ArbExecutor} from "./ArbExecutor";
import BigNumber from "bignumber.js";
import {
  ArbV1Win, ArbV1WinCost,
  ArbV1WinRaw,
  DexProtocolName,
  IArbOperationExecuteResult,
  IFailingArbInfo,
  SwapOperationType,
  Token
} from "./types";
import { parseRawArbV1BigNumber} from "./build-dex/monitor/types";

export default class ArbBuilder {
  private currentArb: ArbExecutor;
  private arbs: ArbV1WinCost[];
  prices: Prices;
  logger: Logger;
  ARB_THRESHOLD: number = 0.1;
  deferredArbs: Record<string, ArbV1WinCost> = {};
  failedArbs: Record<string, IArbOperationExecuteResult<SwapOperationType> | true> = {};
  isWaitingForArb: boolean;

  constructor(public readonly arbWallet: ArbWallet, private readonly balanceMonitor: BalanceMonitor) {
    this.logger = new Logger('ArbExecutor');
  }

  updatePrices(prices: Prices) {
    this.prices = prices;
  }

  updateArbs(arbs: ArbV1WinRaw[]) {
    this.arbs = _.map(arbs, raw => {
      const arb: ArbV1Win = {...parseRawArbV1BigNumber(raw), amountWin: BigNumber(raw.amount_win)};
      let amountWin = BigNumber(arb.amountWin);
      const winUsd = amountWin.multipliedBy(this.getPrice(arb.token0 as Token));
      const bridgePrice = this.estimateBridgePrice(arb);
      return {
        ...arb,
        amountWin,
        winUsd: BigNumber(winUsd),
        bridgeCost: BigNumber(bridgePrice)
      } as ArbV1WinCost;
    }) as ArbV1WinCost[];
    if (this.currentArb) {
      // TODO: check if current arb should be stopped/reverted?
    } else {
      this.chooseAndStartArb();
    }
  }

  private chooseAndStartArb() {
    if (this.currentArb) {
      this.logger.log(`Attempt to choose arb to start while ${this.currentArb.id} is running.`.yellow);
      return;
    }

    const comparator = (a: ArbV1WinCost, b: ArbV1WinCost) => a.id === b.id && a.lastTs === b.lastTs;
    const validArbs = _.differenceWith(this.arbs, Object.values(this.deferredArbs), comparator).filter(arb => !this.failedArbs[arb.id]);
    // TODO: monitor failed conditions and attempt to recover by running ArbExecutor with skipLog to prevent console spam
    const stillDeferredArbs = _.differenceWith(Object.values(this.deferredArbs), validArbs, comparator);
    this.deferredArbs = _.zipObject(_.map(stillDeferredArbs, 'id'), stillDeferredArbs);

    const bestArb = _.maxBy(validArbs, (arb) => arb.winUsd.toNumber());
    if (bestArb?.winUsd.isGreaterThan(this.ARB_THRESHOLD)) {
      this.isWaitingForArb = false;
      this.startArb(bestArb);
    } else {
      if (!this.isWaitingForArb) {
        this.logger.log(`Waiting for winning arb (>$${this.ARB_THRESHOLD.toFixed(2)})...`.yellow);
      }
      this.isWaitingForArb = true;
    }
  }

  private getPrice(token: Token): BigNumber {
    const price = this.prices[token.toUpperCase()];
    if (price) {
      return BigNumber(price);
    } else {
      this.logger.debugOnce(`Unsupported price token ${token}`.red);
      return BigNumber(0);
    }
  }

  private startArb(bestArb: ArbV1WinCost) {
    if (this.currentArb) {
      this.logger.log(`Attempt to start arb while ${this.currentArb.id} is running.`.yellow);
      return;
    }
    this.currentArb = new ArbExecutor(bestArb);
    this.logger.log(`Start arb ${this.currentArb.id} for max win of $${this.currentArb.arb.winUsd}`.green.underline);
    setImmediate(() => {
      this.currentArb.executeCurrentArb(this.arbWallet, this.balanceMonitor).then(this.finishArb.bind(this));
    })
  }

  private async finishArb() {
    if (!this.currentArb) {
      this.logger.log(`Arb already finished.`.yellow);
      return;
    }
    if (this.currentArb.failedReason) {
      this.failedArbs[this.currentArb.id] = this.currentArb.failedReason || true;
      await this.uploadArbFailing(this.currentArb.failedReason);
    } else {
      await this.uploadArbRunLog(this.currentArb.getRunLog());
      this.deferCurrentArb(this.currentArb);
    }
    this.currentArb = null;
    setImmediate(() => {
      this.chooseAndStartArb();
    })
  }

  // noinspection JSUnusedLocalSymbols
  private async uploadArbRunLog(runLog: ArbRunLog) {
    // TODO: upload run operations
  }

  private deferCurrentArb(currentArb: ArbExecutor) {
    this.deferredArbs[currentArb.id] = currentArb.arb;
    this.deferredArbs[currentArb.reverseId] = currentArb.arb;
    // TODO: modify local arbs optimistically depending on currentArb result
    //  so we do not choose the same arb again if it is not winning anymore
    // i.e. remove arbWin from this.arbs, but make sure this.arbs has
  }

  private estimateBridgePrice(arb: ArbV1Win): BigNumber {
    const getChainBridgeCost = (chain: CHAIN): BigNumber => {
      const {feeCurrency, amount} = getGasFeeInfo(chain);
      return this.getPrice(feeCurrency.coinDenom as Token).multipliedBy(amount);
    };

    function getDexBridgeCost(dex: DexProtocolName): BigNumber {
      return getChainBridgeCost(getDexOriginChain(dex));
    }

    const getTokenNativeChainCost = (token0: Token): BigNumber => {
      const nativeToken = getTokenDenomInfo(token0);
      const chainByChainId = getChainByChainId(nativeToken.chainId);
      if (!chainByChainId) {
        this.logger.debugOnce(`Not initialized bridgeCost for chain ${nativeToken.chainId}`);
        return BigNumber(0);
      }
      return getChainBridgeCost(chainByChainId);
    };

    return BigNumber.sum(
      getTokenNativeChainCost(arb.token0 as Token),
      getDexBridgeCost(arb.dex0 as DexProtocolName),
      getDexBridgeCost(arb.dex1 as DexProtocolName),
      getTokenNativeChainCost(arb.token1 as Token));
  }

  private async uploadArbFailing(failedReason: IFailingArbInfo) {
    this.logger.log('Failed arb', JSON.stringify(failedReason).red)
    // TODO: show in UI failing reason for each active arb
  }
}


/**
 * tier 1 "We provide the tools to monitor and operate alpha earning strategies on top of Shade protocol"
 *
 *       tier 2 "Our vision is to build an ecosystem for enabling alpha earning using Cosmos ecosystem protocols."
 *       "Ecosystem will incentivize builders to add connectors to other protocols"
 *
 *
 *       Price of peg of SILK = Basket of other currencies & BTC & Gold & ....
 *
 *
 *
 *       DXY (dollar) ^ Silk vs $ v
 *       BTC ^ SILK vs Dollar ^
 *
 *       $1.07 Borrow 1k SILK sell for USDC = 1070 USDC
 *
 *       $1.03 Repay 1k SILK for 1030 USDC (40$ win)
 *
 *       $ went up against other assets in SILK basket (SHD)
 *
 *       decrease the Dollar in the Silk peg
 *
 *       Borrow = Mint Silk -- Buy Silk from Pools using collateral and give SILK to liquidate positions (Burning SILK) and get more collateral
 *       Repay = Minting Luna (inflationary)
 *
 *       new WithdrawFromShadVault - Buillish on SILK
 *       new
 */
