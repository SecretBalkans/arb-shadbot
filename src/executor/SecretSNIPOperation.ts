import {
  Denom,
  FailReasons,
  IArbOperationExecuteResult, IbcMoveAmountToJSON,
  IOperationData,
  SecretSNIPOperationType,
  SwapTokenMap
} from './types';
import {ArbWallet} from '../wallet/ArbWallet';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {CHAIN} from '../ibc';
import BigNumber from "bignumber.js";
import {getGasFeeInfo} from "./utils";
import {convertCoinToUDenomV2} from "./build-dex/utils";
import {AArbOperationSequenced} from "./aArbOperationSequenced";

export class SecretSNIPOperation extends AArbOperationSequenced<SecretSNIPOperationType> {
  constructor(data: IOperationData<SecretSNIPOperationType>, shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
  }

  toJSON() {
    return IbcMoveAmountToJSON(this.data.amount)
  }
  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean; result: IArbOperationExecuteResult<SecretSNIPOperationType> }> {
    const resolvedAmount = await this.resolveArbOperationAmount({
      amount: this.data.amount,
      token: this.data.token
    }, arbWallet, balanceMonitor);
    if (!(BigNumber.isBigNumber(resolvedAmount))) {
      return {
        success: false,
        result: {
          reason: FailReasons.NoBalance,
          message: `Cannot ${this.data.wrap ? 'wrap' : 'unwrap'} ${resolvedAmount.data} ${this.data.token}. Reason: ${resolvedAmount.reason}`,
          ...resolvedAmount
        }
      };
    }
    const secretAddress = arbWallet.getSecretAddress(this.data.token);
    let result;
    const amountString = convertCoinToUDenomV2(resolvedAmount, secretAddress.decimals).toString();
    const denom = this.data.token === 'SCRT' ? 'uscrt' as Denom : arbWallet.makeIBCHash(SwapTokenMap[this.data.token], CHAIN.Secret) as string as Denom;
    if (this.data.wrap) {
      this.logger.log(`Wrap ${resolvedAmount} ${this.data.token}`.blue);
      result = await arbWallet.executeSecretContract({
        contractAddress: secretAddress.address, msg: {
          "deposit": {},
        },
        gasPrice: getGasFeeInfo(CHAIN.Secret).feeCurrency.gasPriceStep.low,
        gasLimit: 60_000,
        sentFunds: [{
          denom,
          amount: amountString
        }]
      });
    } else {
      this.logger.log(`Unwrap ${resolvedAmount} s${this.data.token}`.blue);
      result = await arbWallet.executeSecretContract({
        contractAddress: secretAddress.address,
        msg: {
          "redeem": {
            "amount": amountString,
            "denom": denom
          }
        },
        gasPrice: getGasFeeInfo(CHAIN.Secret).feeCurrency.gasPriceStep.low,
        gasLimit: 60_000
      });
    }
    if (result.code) {
      return {
        success: false,
        result: {
          internal: result.transactionHash,
          isWrapped: false,
          reason: FailReasons.Unhandled,
          data: result.rawLog
        }
      }
    } else {
      return {
        success: true,
        result: {
          amount: resolvedAmount,
          internal: result.tx,
          isWrapped: this.data.wrap
        }
      }
    }
  }

  id(): string {
    return `${this.data.unwrap ? 'unwrap' : 'wrap'}.${SwapTokenMap[this.data.token]}`;
  }

  type(): string {
    return 'SecretSNIP';
  }
}
