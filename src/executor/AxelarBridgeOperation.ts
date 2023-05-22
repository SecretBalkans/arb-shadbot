import {IBCOperationType, FailReasons, IArbOperationExecuteResult, IFailingArbInfo, IOperationData} from './types';
import {Logger} from '../utils';
import {ArbWallet} from '../wallet/ArbWallet';
import BigNumber from 'bignumber.js';
import {Amount, CHAIN, getTokenDenomInfo, SwapToken, SwapTokenMap} from '../ibc';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {IBCTransferOperation} from "./IBCTransferOperation";
import {AxelarAssetTransfer, AxelarQueryAPI, CHAINS, Environment} from "@axelar-network/axelarjs-sdk";

const api = new AxelarQueryAPI({environment: Environment.MAINNET});

function getTimeoutTimestamp() {
  const timeoutInMinutes = 15;
  const timeoutTimestampInSeconds = Math.floor(
    new Date().getTime() / 1000 + 60 * timeoutInMinutes,
  );
  const timeoutTimestampNanoseconds = BigNumber(
    timeoutTimestampInSeconds,
  ).multipliedBy(1_000_000_000);

  return timeoutTimestampNanoseconds.toNumber();
}

const axelarSDK = new AxelarAssetTransfer({
  environment: Environment.MAINNET,
});
const ChainAxelarMapping: Partial<Record<CHAIN, string>> = {
  [CHAIN.Osmosis]: CHAINS.MAINNET.OSMOSIS,
  [CHAIN.Secret]: CHAINS.MAINNET.SECRET,
}

export default class AxelarBridgeOperation extends IBCTransferOperation {
  type() {
    return 'AxlrTransfer';
  };

  logger: Logger;

  id(): string {
    return `${this.data.token}_${this.data.from}-${this.data.to}`;
  }

  constructor(data: IOperationData<IBCOperationType>, shouldLogDetails: boolean = true) {
    super(data, shouldLogDetails);
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean, result: IArbOperationExecuteResult<IBCOperationType> }> {
    let resolvedAmount = await this.resolveArbOperationAmount({
      amount: this.data.amount,
      token: this.data.token
    }, arbWallet, balanceMonitor);
    if (resolvedAmount instanceof BigNumber) {
      const result = await this.transferAxelar({
        amount: resolvedAmount,
        from: this.data.from,
        to: this.data.to,
        token: this.data.token,
      }, arbWallet);
      return (result instanceof BigNumber) ? {
        success: true,
        result: {
          amount: result,
        },
      } : {
        success: false,
        result,
      };
    } else {
      return {
        success: false,
        result: resolvedAmount
      };
    }
  }

  private async transferAxelar({
                                 amount,
                                 to,
                                 token,
                                 from,
                               }: {
                                 from: CHAIN,
                                 to: CHAIN,
                                 amount: Amount,
                                 token: SwapToken
                               }
    , arbWallet: ArbWallet): Promise<Amount | IFailingArbInfo> {
    const fromChain = ChainAxelarMapping[from];
    const toChain = ChainAxelarMapping[to];

    if (!fromChain) {
      return {
        reason: FailReasons.IBC,
        data: JSON.stringify(ChainAxelarMapping),
        message: `Not mapped ChainAxelarMapping[${from}]`
      }
    }
    if (!toChain) {
      return {
        reason: FailReasons.IBC,
        data: JSON.stringify(ChainAxelarMapping),
        message: `Not mapped chain ChainAxelarMapping[${to}]`
      }
    }

    let destinationAddress = await arbWallet.getAddress(to);
    let asset = getTokenDenomInfo(SwapTokenMap[token]);  // denom of asset on Axelar

    const depositAddress = await axelarSDK.getDepositAddress({
      fromChain,
      toChain,
      destinationAddress,
      asset: asset.chainDenom
    });

    return this.transferIBC({
      amount,
      from,
      to: CHAIN.Axelar,
      token,
      depositAddress,
      isWrapped: true
    }, arbWallet)
  }
}
