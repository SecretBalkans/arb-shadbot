import {CHAIN, getChainByChainId, getTokenDenomInfo, SUPPORTED_CHAINS} from '../ibc';
import {Amount, SwapToken, SwapTokenMap} from '../ibc';
import {BalanceMonitor, CanLog} from '../balances/BalanceMonitor';
import {Logger} from '../utils';
import {IbcMoveAmount, IBCMoveCHAIN, MoveOperationType, SwapMoveOperationsType} from './types';
import _ from 'lodash';
import {BalanceWaitOperation} from './BalanceWaitOperation';
import {BalanceCheckOperation} from './BalanceCheckOperation';
import {IBCTransferOperation} from './IBCTransferOperation';
import {ArbOperation} from './aArbOperation';
import {SecretSNIPOperation} from "./SecretSNIPOperation";
import BigNumber from 'bignumber.js';

export const MAX_IBC_FINISH_WAIT_TIME_DEFAULT = 120_000;

export type ChainTokenBalanceResult = { isWrapped: boolean | 'both', amount: Amount, chain: CHAIN };
export default class MoveIBC implements CanLog {
  logger: Logger;

  constructor(private readonly balanceMonitor: BalanceMonitor) {
    this.logger = new Logger('MoveIBC');
  }

  /***
   * Moves token from any chain to another chain. For Secret - source can be wrapped/unwrapped (whichever has bigger balance) and for target if Secret the token will be wrapped
   * @param originChain
   * @param toChain
   * @param token
   * @param amount
   * @param amountMin
   */
  async createMoveIbcPlan({
                            fromChain,
                            toChain,
                            token,
                            amount,
                            amountMin,
                          }: {
    fromChain: IBCMoveCHAIN, toChain: CHAIN, token: SwapToken, amount: IbcMoveAmount | ArbOperation<SwapMoveOperationsType>, amountMin?: Amount
  }): Promise<ArbOperation<MoveOperationType>[] | false> {
    let effectiveFromChain: CHAIN;
    let isWrappedOriginBalance;
    if (fromChain === 'any') {
      // Find the best chain (including wrapped on Secret) to move funds from
      let bestTokenBalance = this.findChainWithTokenBalance(token);
      effectiveFromChain = bestTokenBalance.chain;
      isWrappedOriginBalance = bestTokenBalance.isWrapped;
    } else if (fromChain === CHAIN.Secret) {
      // if we specifically move from secret, we check whether we have better wrapped or unwrapped balance
      let secretChainBalances = this.getSecretChainBalances(token);
      let bestSecretBalance = _.maxBy(secretChainBalances, amountPredicate) as ChainTokenBalanceResult;
      effectiveFromChain = CHAIN.Secret;
      isWrappedOriginBalance = bestSecretBalance.isWrapped
    } else {
      // otherwise from chain is not on secret
      effectiveFromChain = fromChain;
      isWrappedOriginBalance = false;
    }

    if (!effectiveFromChain) {
      this.logger.log(`No ${token} to move on any chain.`.blue);
      return false;
    }

     if (effectiveFromChain === toChain) {
      return [
        // Wrap if we found that the best balance is unwrapped on Secret
        ...(!isWrappedOriginBalance && toChain === CHAIN.Secret ? [new SecretSNIPOperation({
          token,
          amount: new BalanceCheckOperation({
            chain: toChain,
            token,
            amountMax: amount,
            amountMin,
            isWrapped: false
          }),
          wrap: true
        }), new BalanceWaitOperation({
          chain: CHAIN.Secret,
          token,
          isWrapped: true
        })] : [
          new BalanceCheckOperation({
            chain: toChain,
            token,
            amountMax: amount,
            amountMin,
            // Ensure that the result for Secret is the wrapped in the BalanceCheckOperation
            isWrapped: toChain === CHAIN.Secret
          })
        ])];
    }
    const assetNativeChain: CHAIN = getChainByChainId(getTokenDenomInfo(SwapTokenMap[token]).chainId);

    // TODO: better check for ics tokens instead only checking for AXLR chain
    let secretSNIPOperationOnOrigin = isWrappedOriginBalance && assetNativeChain !== CHAIN.Axelar ? [new SecretSNIPOperation({
      token,
      unwrap: true,
      amount: new BalanceCheckOperation({
        chain: CHAIN.Secret,
        token,
        amountMax: amount,
        amountMin: amountMin,
        isWrapped: true
      })
    }), new BalanceWaitOperation({
      chain: CHAIN.Secret,
      token,
      isWrapped: false
    })] : [];

    let secretSnipOperationOnDestination = toChain === CHAIN.Secret && assetNativeChain !== CHAIN.Axelar? [new SecretSNIPOperation({
      token,
      wrap: true,
      amount: new BalanceWaitOperation({
        chain: CHAIN.Secret,
        token,
        isWrapped: false
      }),
    }), new BalanceWaitOperation({
      chain: toChain,
      token,
      isWrapped: true
    })] : [new BalanceWaitOperation({
      chain: toChain,
      token,
      // TODO: we move Axelar tokens using ICS contract on Secret. better check for ics tokens
      isWrapped: toChain === CHAIN.Secret && assetNativeChain === CHAIN.Axelar
    })];

    let result: ArbOperation<MoveOperationType>[];
    if (assetNativeChain !== toChain && assetNativeChain !== effectiveFromChain) {
      /*if (assetNativeChain === CHAIN.Axelar) {
        result = [
          new AxelarBridgeOperation({
            from: effectiveFromChain,
            to: toChain,
            amount: new BalanceCheckOperation({
              token,
              amountMax: amount,
              chain: effectiveFromChain,
              amountMin,
              isWrapped: effectiveFromChain === CHAIN.Secret
            }),
            token
          }),
          // For axelar transfers the amount comes in wrapped form
          new BalanceWaitOperation({
            chain: toChain,
            token,
            isWrapped: effectiveFromChain === CHAIN.Secret
          })
        ]
      } else {*/
      let shouldMoveWrapped = isWrappedOriginBalance && !secretSNIPOperationOnOrigin.length && effectiveFromChain === CHAIN.Secret;
      result = [
        ...secretSNIPOperationOnOrigin,
        new IBCTransferOperation({
          from: effectiveFromChain,
          to: assetNativeChain,
          token,
          amount: new BalanceCheckOperation({
            token,
            amountMax: amount,
            chain: effectiveFromChain,
            amountMin,
            // if we didn't do secret snip (for example on axelar) we will use wrapped secret token
            isWrapped: shouldMoveWrapped
          }),
          isWrapped: shouldMoveWrapped
        }), new IBCTransferOperation({
          from: assetNativeChain,
          to: toChain,
          amount: new BalanceWaitOperation({
            chain: assetNativeChain,
            token,
            isWrapped: false,
          }),
          token,
          isWrapped: toChain === CHAIN.Secret && assetNativeChain === CHAIN.Axelar
        }),
        ...secretSnipOperationOnDestination];
      // }
    } else {
      // Move Native asset from/to it's own chain directly
      result = [
        ...secretSNIPOperationOnOrigin,
        new IBCTransferOperation({
          from: effectiveFromChain,
          to: toChain,
          token,
          amount: new BalanceCheckOperation({
            chain: effectiveFromChain,
            token,
            amountMax: amount,
            amountMin,
            isWrapped: false,
          }),
        }),
        ...secretSnipOperationOnDestination
      ];
    }
    return _.compact(result);
  }

  getSecretChainBalances(token: SwapToken): ChainTokenBalanceResult[] {
    return [{
      chain: CHAIN.Secret,
      isWrapped: true,
      amount: this.balanceMonitor.getTokenAmount(CHAIN.Secret, SwapTokenMap[token], true) || BigNumber(0)
    }, {
      chain: CHAIN.Secret,
      isWrapped: false,
      amount: this.balanceMonitor.getTokenAmount(CHAIN.Secret, SwapTokenMap[token], false) || BigNumber(0)
    }]
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

  private findChainWithTokenBalance(swapToken: SwapToken): ChainTokenBalanceResult {
    const token = SwapTokenMap[swapToken];
    const chainAmounts = _.flatMap(SUPPORTED_CHAINS, (chainCandidate) => {
      if (chainCandidate === CHAIN.Secret) {
        return this.getSecretChainBalances(swapToken)
      } else {
        return [{
          chain: chainCandidate,
          amount: this.balanceMonitor.getTokenAmount(chainCandidate, token, false) || BigNumber(0)
        }];
      }
    }) as unknown as ChainTokenBalanceResult[];
    return _.maxBy(chainAmounts, amountPredicate) as ChainTokenBalanceResult;
  }
}

function amountPredicate({amount}) {
  return amount.toNumber();
}
