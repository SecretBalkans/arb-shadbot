import {CHAIN, getChainByChainId, getTokenDenomInfo, SUPPORTED_CHAINS} from '../ibc';
import {Amount, SwapToken, SwapTokenMap} from '../ibc/dexTypes';
import {BalanceMonitor, CanLog} from '../balances/BalanceMonitor';
import {Logger} from '../utils';
import {IbcMoveAmount, IBCMoveCHAIN, MoveOperationType} from './types';
import _ from 'lodash';
import {BalanceWaitOperation} from './BalanceWaitOperation';
import {BalanceCheckOperation} from './BalanceCheckOperation';
import {BridgeOperation} from './BridgeOperation';
import {ArbOperation} from './aArbOperation';

export const MAX_IBC_FINISH_WAIT_TIME_DEFAULT = 120_000;

export default class MoveIBC implements CanLog {
  logger: Logger;

  constructor(private readonly balanceMonitor: BalanceMonitor) {
    this.logger = new Logger('MoveIBC');
  }

  async createMoveIbcPlan({
                            originChain,
                            toChain,
                            token,
                            amount,
                            amountMin,
                          }: {
    originChain: IBCMoveCHAIN, toChain: CHAIN, token: SwapToken, amount: IbcMoveAmount, amountMin: Amount
  }): Promise<ArbOperation<MoveOperationType>[] | false> {
    let fromChain;
    if (originChain === 'any') {
      fromChain = this.findChainWithTokenBalance(token);
    } else {
      fromChain = originChain;
    }
    if (!fromChain) {
      this.logger.log(`No ${token} to move on any chain.`.blue);
      return false;
    }

    if (fromChain === toChain) {
      return [new BalanceCheckOperation({
        chain: fromChain,
        token,
        amountMax: amount,
        amountMin
      })]
    }
    const assetNativeChain: CHAIN = getChainByChainId(getTokenDenomInfo(SwapTokenMap[token]).chainId);
    if (assetNativeChain === toChain || assetNativeChain === fromChain) {
      // Move Native asset from/to it's chain
      this.logger.log(`Try move max ${amount.toString()} ${token} from ${fromChain} to ${toChain} directly.`.blue);

      return [
        new BridgeOperation({
          from: fromChain,
          to: toChain,
          token,
          amount: new BalanceCheckOperation({
            chain: fromChain,
            token,
            amountMax: amount,
            amountMin
          }),
        }), new BalanceWaitOperation({
          chain: toChain,
          token,
        })];
    } else {
      this.logger.log(`Try move max ${amount.toString()} ${token} from ${fromChain} to ${toChain} through ${assetNativeChain}`.blue);
      const initialMove = new BridgeOperation({
        from: fromChain,
        to: assetNativeChain,
        token,
        amount: new BalanceCheckOperation({
          token,
          amountMax: amount,
          chain: fromChain,
          amountMin
        }),
      });
      return [
        initialMove,
        new BalanceWaitOperation({
          chain: assetNativeChain,
          token,
        }), new BridgeOperation({
          from: assetNativeChain,
          to: toChain,
          amount: initialMove,
          token,
        }), new BalanceWaitOperation({
          token,
          chain: toChain,
        })];
    }
  }

  /*
    async moveIBC(originChain: IBCMoveCHAIN, destinationChain: CHAIN, asset: SwapToken, amount: IbcMoveAmount, {
                    waitAppear = false,
                    maxWaitTime = MAX_IBC_FINISH_WAIT_TIME_DEFAULT,
                  } = {},
    ): Promise<Amount | false> {
      let chain;
      if (originChain === 'any') {
        chain = this.findChainWithTokenBalance(asset);
        chain = originChain;
      }
      if (!chain) {
        this.logger.log(`Not ${asset} to move on any chain.`.blue);
        return false;
      }
      if (waitAppear) {
        await this.balanceMonitor.waitForChainBalanceUpdate(chain, asset, { isBalanceCheck: true });
      }
      if (chain === destinationChain) {
        this.logger.log(`Move same chain attempted ${amount.toString()} ${asset} from ${chain} to ${destinationChain}. Will continue...`.blue);
        return await this.getMaxMoveAmountFromChain(chain, asset, amount);
      }
      const assetNativeChain: CHAIN = getChainByChainId(getTokenDenomInfo(SwapTokenMap[asset]).chainId);
      if (assetNativeChain === destinationChain || assetNativeChain === chain) {
        // Move Native asset from/to it's chain
        this.logger.log(`Try move ${amount.toString()} ${asset} from ${chain} to ${destinationChain} directly.`.blue);
        return await this.transferIBC(chain, destinationChain, asset, amount, { maxWaitTime });
      } else {
        this.logger.log(`Try move ${amount.toString()} ${asset} from ${chain} to ${destinationChain} through ${assetNativeChain}`.blue);
        // Otherwise move it through its native chain
        if (await this.transferIBC(chain, assetNativeChain, asset, amount, { maxWaitTime })) {
          return await this.transferIBC(assetNativeChain, destinationChain, asset, amount, { maxWaitTime });
        } else {
          return false;
        }
      }
    }*/

  private findChainWithTokenBalance(swapToken: SwapToken): CHAIN {
    const token = SwapTokenMap[swapToken];
    return _.maxBy(SUPPORTED_CHAINS, (chainCandidate) => this.balanceMonitor.getTokenAmount(chainCandidate, token).toNumber());
  }
}
