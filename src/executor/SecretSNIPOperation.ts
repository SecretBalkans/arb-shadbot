import {IArbOperationExecuteResult, IOperationData, SecretSNIPOperationType} from './types';
import {ArbWallet} from '../wallet/ArbWallet';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {Denom, SwapTokenMap} from '../ibc';
import {CHAIN, getTokenDenomInfo} from '../ibc';
import {ArbOperationSequenced} from './aArbOperation';
import {convertCoinToUDenomV2} from "../utils/denoms";
import BigNumber from "bignumber.js";

export class SecretSNIPOperation extends ArbOperationSequenced<SecretSNIPOperationType> {
  constructor(data: IOperationData<SecretSNIPOperationType>, shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean; result: IArbOperationExecuteResult<SecretSNIPOperationType> }> {
    let resolvedAmount = await this.resolveArbOperationAmount({
      amount: this.data.amount,
      token: this.data.token
    }, arbWallet, balanceMonitor);
    if (!(resolvedAmount instanceof BigNumber)) {
      return {
        success: false,
        result: {
          ...resolvedAmount,
          message: `Cannot ${this.data.wrap ? 'wrap' : 'unwrap'} ${resolvedAmount.data} ${this.data.token}. Rason: ${resolvedAmount.reason}`
        }
      };
    }
    let secretAddress = arbWallet.getSecretAddress(this.data.token);
    let result;
    let tokenDenomInfo = getTokenDenomInfo(SwapTokenMap[this.data.token]);
    let amountString = convertCoinToUDenomV2(resolvedAmount, secretAddress.decimals).toString();
    if (this.data.wrap) {
      result = await arbWallet.executeSecretContract({
        contractAddress: secretAddress.address, msg: {
          "deposit": {},
        }, gasPrice: 0.015, gasLimit: 60_000,
        sentFunds: [{
          denom: arbWallet.makeIBCHash(SwapTokenMap[this.data.token], CHAIN.Secret) as string as Denom,
          amount: amountString
        }]
      });
    } else {
      result = await arbWallet.executeSecretContract({
        contractAddress: secretAddress.address, msg: {
          "redeem": {
            "amount": amountString,
            "denom": tokenDenomInfo.chainDenom.toString()
          }
        }, gasPrice: 0.015, gasLimit: 60_000
      });
    }
    return {
      success: true,
      result: {
        amount: resolvedAmount,
        internal: result.tx,
        isWrapped: this.data.wrap
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
