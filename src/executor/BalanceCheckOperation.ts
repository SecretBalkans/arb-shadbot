import {
  BalanceCheckOperationType,
  FailReasons,
  IArbOperationExecuteResult,
  IbcMoveAmount,
  IOperationData
} from './types';
import {ArbWallet} from '../wallet/ArbWallet';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {Amount, SwapToken, SwapTokenMap} from '../ibc';
import {CHAIN, getChainByChainId, getTokenDenomInfo} from '../ibc';
import BigNumber from 'bignumber.js';
import {getGasFeeInfo} from './utils';
import { ArbOperationSequenced} from './aArbOperation';

export class BalanceCheckOperation extends ArbOperationSequenced<BalanceCheckOperationType> {
  constructor(data: IOperationData<BalanceCheckOperationType>, shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean; result: IArbOperationExecuteResult<BalanceCheckOperationType> }> {
    await balanceMonitor.waitForChainBalanceUpdate(this.data.chain, this.data.token, {
      isBalanceCheck: true,
      isWrapped: this.data.isWrapped
    });
    let amountMax = this.data.amountMax;
    if (amountMax !== 'max' && !(amountMax instanceof BigNumber)) {
      let resolvedAmount = await this.resolveArbOperationAmount({
        amount: amountMax,
        token: this.data.token
      }, arbWallet, balanceMonitor);
      if (resolvedAmount instanceof BigNumber) {
        amountMax = resolvedAmount;
      } else {
        const msgRsn = resolvedAmount.reason === FailReasons.MinAmount ? `less than amountMin estimation ${resolvedAmount.data} ${this.data.token}` : resolvedAmount.reason === FailReasons.NoBalance ? `balance is ${resolvedAmount.data} ${this.data.token}` : `${resolvedAmount.reason}`;
        const message = `Can't use ${this.data.isWrapped ? "wrapped " : ''}${resolvedAmount.data} ${this.data.token} on chain ${this.data.chain}. Reason: ${msgRsn}`;

        return {
          success: false,
          result: {
            ...resolvedAmount,
            message
          }
        };
      }
    }
    let amount = this.getMaxMoveAmountFromChain(balanceMonitor, {
      originChain: this.data.chain,
      asset: this.data.token,
      isWrapped: this.data.isWrapped,
      // TODO: remove this artificial amountMax
      amountMax,
    });

    // TODO: remove this artificial amountMin check
    return /*amount.isGreaterThan(this.data.amountMin)*/ amount.isGreaterThan(0) ? {
      success: true,
      result: {
        amount,
      },
    } : {
      success: false,
      result: {
        data: this.data.amountMin.toFixed(getTokenDenomInfo(SwapTokenMap[this.data.token]).decimals),
        internal: amount,
        message: `Not enough balance of ${this.data.token} on ${this.data.chain}. Minimum needed: ${this.data.amountMin}`,
        reason: this.data.amountMin.isGreaterThan(0) ? FailReasons.MinAmount : FailReasons.NoBalance
      },
    };
  }

  private ORIGIN_CHAIN_MIN_FEE_MULTIPLIER = 10;

  id(): string {
    return `${this.data.chain}.${SwapTokenMap[this.data.token]}`;
  }

  type(): string {
    return 'BalanceCheck';
  }

  private getMaxMoveAmountFromChain(balanceMonitor: BalanceMonitor, {
    originChain,
    asset,
    amountMax,
    isWrapped,
  }: { originChain: CHAIN, asset: SwapToken, amountMax: IbcMoveAmount, isWrapped: boolean }): Amount {
    const balanceAmount = balanceMonitor.getTokenAmount(originChain, SwapTokenMap[asset], isWrapped);
    if (!balanceAmount) {
      return BigNumber(0);
    }
    const gasFeeInfo = getGasFeeInfo(originChain);
    const assetNativeChain: CHAIN = getChainByChainId(getTokenDenomInfo(SwapTokenMap[asset]).chainId);
    let moveAmount: BigNumber;
    const reserveAmount = BigNumber(gasFeeInfo.amount).multipliedBy(this.ORIGIN_CHAIN_MIN_FEE_MULTIPLIER);

    if (amountMax === 'max') {
      moveAmount = balanceAmount;
    } else {
      moveAmount = amountMax;
    }

    if (assetNativeChain === originChain && SwapTokenMap[asset] === gasFeeInfo.feeCurrency.coinDenom) {
      if (amountMax === 'max') {
        moveAmount = balanceAmount.minus(reserveAmount);
      }
      // if this is the origin asset chain make sure to reserve
      if (balanceAmount.isLessThan(moveAmount.plus(reserveAmount))) {
        // Trim amount to the amount possible
        moveAmount = balanceAmount.minus(reserveAmount);
      }
    }
    if (moveAmount.isGreaterThan(balanceAmount)) {
      moveAmount = balanceAmount;
    }
    return moveAmount.isGreaterThan(0) ? moveAmount : BigNumber(0);
  }
}
