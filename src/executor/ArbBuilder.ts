import _ from 'lodash';
import {ArbV1} from '../gqlClient';
import {CHAIN, getChainByChainId, getDexOriginChain, getTokenDenomInfo} from '../ibc';
import {Amount, DexProtocolName, Token} from '../ibc/dexTypes';
import {Prices} from '../prices/prices';
import {ArbWallet} from '../wallet/ArbWallet';
import {Logger} from '../utils';
import {getGasFeeInfo} from './utils';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {ArbRunLog} from "./ArbRunLog";
import {ArbExecutor} from "./ArbExecutor";
import BigNumber from "bignumber.js";
import {IArbOperationExecuteResult, IFailingArbInfo, SwapOperationType} from "./types";

export default class ArbBuilder {
  private currentArb: ArbExecutor;
  private arbs: ArbV1[];
  prices: Prices;
  logger: Logger;
  ARB_THRESHOLD: number = 0.1;
  deferredArbs: Record<string, ArbV1> = {};
  failedArbs: Record<string, IArbOperationExecuteResult<SwapOperationType> | true> = {};
  isWaitingForArb: boolean;

  constructor(public readonly arbWallet: ArbWallet, private readonly balanceMonitor: BalanceMonitor) {
    this.logger = new Logger('ArbExecutor');
  }

  updatePrices(prices: Prices) {
    this.prices = prices;
  }

  updateArbs(arbs: ArbV1[]) {
    this.arbs = arbs;
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

    const comparator = (a: ArbV1, b: ArbV1) => a.id === b.id && a.lastTs === b.lastTs;
    const validArbs = _.differenceWith(this.arbs, Object.values(this.deferredArbs), comparator).filter(arb => !this.failedArbs[arb.id]);
    // TODO: monitor failed conditions and attempt to recover by running ArbExecutor with skipLog to prevent console spam
    const stillDeferredArbs = _.differenceWith(Object.values(this.deferredArbs), validArbs, comparator);
    this.deferredArbs = _.zipObject(_.map(stillDeferredArbs, 'id'), stillDeferredArbs);

    const bestArb = _.maxBy(validArbs, (arb) => this.getArbWinInUsdAndEstimateBridgeCost(arb).toNumber());
    const arbWinUsd = bestArb && this.getArbWinInUsdAndEstimateBridgeCost(bestArb);
    if (bestArb && arbWinUsd.isGreaterThan(this.ARB_THRESHOLD)) {
      this.isWaitingForArb = false;
      this.startArb(bestArb);
    } else {
      if (!this.isWaitingForArb) {
        this.logger.log(`Waiting for winning arb (>$${this.ARB_THRESHOLD.toFixed(2)})...`.yellow);
      }
      this.isWaitingForArb = true;
    }
  }

  private getArbWinInUsdAndEstimateBridgeCost(arb: ArbV1): Amount {
    // TODO: think where to put builder for estimated arb
    const bridgePrice = this.estimateBridgePrice(arb);
    const usdWin = arb.amountWin.multipliedBy(this.getPrice(arb.token0 as Token));
    arb.bridgeCost = BigNumber(bridgePrice);
    arb.winUsd = BigNumber(usdWin);
    return usdWin.minus(bridgePrice);
  }

  private getPrice(token: Token) {
    const price = this.prices[token.toUpperCase()];
    if (price) {
      return price;
    } else {
      this.logger.debugOnce(`Unsupported price token ${token}`.red);
    }
  }

  private startArb(bestArb: ArbV1) {
    if (this.currentArb) {
      this.logger.log(`Attempt to start arb while ${this.currentArb.id} is running.`.yellow);
      return;
    }
    this.currentArb = new ArbExecutor(bestArb);
    this.logger.log(`Start arb ${this.currentArb.id} for win $${this.getArbWinInUsdAndEstimateBridgeCost(bestArb)}`.green.underline);
    this.currentArb.execute(this.arbWallet, this.balanceMonitor).then(this.finishArb.bind(this));
  }

  private async finishArb() {
    if (!this.currentArb) {
      this.logger.log(`Arb already finished.`.yellow);
      return;
    }
    if(this.currentArb.failedReason) {
      this.failedArbs[this.currentArb.id] = this.currentArb.failedReason || true;
      await this.uploadArbFailing(this.currentArb.failedReason);
    }
    await this.uploadArbRunLog(this.currentArb.getRunLog());
    this.deferCurrentArb(this.currentArb);
    this.currentArb = null;
    this.chooseAndStartArb();
  }

  // noinspection JSUnusedLocalSymbols
  private async uploadArbRunLog(runLog: ArbRunLog) {
    // TODO: upload run operations
  }

  private deferCurrentArb(currentArb: ArbExecutor) {
    this.deferredArbs[currentArb.id] = currentArb.arb;
    // TODO: modify local arbs optimistically depending on currentArb result
    //  so we do not choose the same arb again if it is not winning anymore
    // i.e. remove arbWin from this.arbs, but make sure this.arbs has
  }

  private estimateBridgePrice(arb: ArbV1): number {
    const getChainBridgeCost = (chain: CHAIN) => {
      const {feeCurrency, amount} = getGasFeeInfo(chain);
      return (amount as number) * this.getPrice(feeCurrency.coinDenom as Token);
    };

    function getDexBridgeCost(dex: DexProtocolName) {
      return getChainBridgeCost(getDexOriginChain(dex));
    }

    const getTokenNativeChainCost = (token0: Token) => {
      const nativeToken = getTokenDenomInfo(token0);
      const chainByChainId = getChainByChainId(nativeToken.chainId);
      if (!chainByChainId) {
        this.logger.debugOnce(`Not initialized bridgeCost for chain ${nativeToken.chainId}`);
        return 0;
      }
      return getChainBridgeCost(chainByChainId);
    };

    return _.sumBy([getTokenNativeChainCost(arb.token0 as Token), getDexBridgeCost(arb.dex0 as DexProtocolName), getDexBridgeCost(arb.dex1 as DexProtocolName), getTokenNativeChainCost(arb.token1 as Token)], (val) => {
      if (_.isNaN(+val)) {
        return 0;
      }
      return +val;
    });
  }

  private async uploadArbFailing(failedReason: IFailingArbInfo) {
    this.logger.log((failedReason.message || JSON.stringify(failedReason)).red)
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
