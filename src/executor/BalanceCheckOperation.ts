import {
  BalanceCheckOperationType,
  FailReasons,
  IArbOperationExecuteResult,
  IbcMoveAmount,
  IOperationData
} from './types';
import {ArbWallet} from '../wallet/ArbWallet';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {Amount, SwapToken, SwapTokenMap} from '../ibc/dexTypes';
import {CHAIN, getChainByChainId, getTokenDenomInfo} from '../ibc';
import BigNumber from 'bignumber.js';
import {getGasFeeInfo} from './utils';
import {ArbOperation} from './aArbOperation';

export class BalanceCheckOperation extends ArbOperation<BalanceCheckOperationType> {
  constructor(data: IOperationData<BalanceCheckOperationType>, shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean; result: IArbOperationExecuteResult<BalanceCheckOperationType> }> {
    await balanceMonitor.waitForChainBalanceUpdate(this.data.chain, this.data.token, {isBalanceCheck: true});
    const amount = await this.getMaxMoveAmountFromChain(balanceMonitor, {
      originChain: this.data.chain,
      asset: this.data.token,
      amountMax: this.data.amountMax,
    });
    return amount.isGreaterThan(this.data.amountMin) ? {
      success: true,
      result: {
        amount,
      },
    } : {
      success: false,
      result: {
        data: this.data.amountMin.toFixed(getTokenDenomInfo(SwapTokenMap[this.data.token]).decimals),
        internal: amount,
        message: `No balance of ${this.data.token}. Minimum needed: ${this.data.amountMin}`,
        reason: FailReasons.NoBalance
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

  private async getMaxMoveAmountFromChain(balanceMonitor: BalanceMonitor, {
    originChain,
    asset,
    amountMax,
  }: { originChain: CHAIN, asset: SwapToken, amountMax: IbcMoveAmount }): Promise<Amount> {
    const balanceAmount = balanceMonitor.getTokenAmount(originChain, SwapTokenMap[asset]);
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
        moveAmount = balanceAmount.minus(reserveAmount); // TODO: ?? should we throw if we want to move too much instead of trimming it to 'max' ??
      }
    }
    if (moveAmount.isGreaterThan(balanceAmount)) {
      moveAmount = balanceAmount;
    }
    return moveAmount.isGreaterThan(0) ? moveAmount : BigNumber(0);
  }
}
