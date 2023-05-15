import {
  BridgeOperationData,
  BridgeOperationType,
  FailReasons,
  IArbOperationExecuteResult,
  IFailingArbInfo,
  IOperationData
} from './types';
import {Logger} from '../utils';
import {ArbWallet} from '../wallet/ArbWallet';
import BigNumber from 'bignumber.js';
import {getChainByChainId} from '../ibc';
import {convertCoinToUDenomV2, makeIBCMinimalDenom} from '../utils/denoms';
import {StdFee} from '@cosmjs/stargate';
import {MsgTransfer} from 'cosmjs-types/ibc/applications/transfer/v1/tx';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {ArbOperation} from './aArbOperation';
import {getGasFeeInfo} from "./utils";
import {BalanceCheckOperation} from "./BalanceCheckOperation";
import {Amount, SwapTokenMap} from "../ibc/dexTypes";
import {getTokenBaseDenomInfo} from "../ibc/tokens";

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


export class BridgeOperation extends ArbOperation<BridgeOperationType> {
  type() {
    return 'Bridge';
  };

  logger: Logger;

  constructor(data: IOperationData<BridgeOperationType>, shouldLogDetails: boolean = true) {
    super(data, shouldLogDetails);
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean, result: IArbOperationExecuteResult<BridgeOperationType> }> {
    const result = await this.transferIBC(this.data, arbWallet, balanceMonitor);
    return (result instanceof BigNumber)  ? {
      success: true,
      result: {
        amount: result,
      },
    } : {
      success: false,
      result,
    };
  }

  private async transferIBC({
                              amount,
                              to,
                              token,
                              from,
                            }: BridgeOperationData, arbWallet, balanceMonitor): Promise<Amount | IFailingArbInfo> {
    let resolvedAmount, balanceCheck;
    if (!(amount instanceof BigNumber)) {
      balanceCheck = await amount.execute(arbWallet, balanceMonitor);
      resolvedAmount = balanceCheck.success ? balanceCheck.result.amount : new BigNumber(balanceCheck.result.internal);
    }
    if ((balanceCheck && !balanceCheck?.result?.success) || resolvedAmount.isEqualTo(0)) {
      let decimalPlaces = getTokenBaseDenomInfo(SwapTokenMap[token]).decimals;
      const amountMin = !(amount instanceof BigNumber) && (amount as BalanceCheckOperation).data?.amountMin;
      const msgRsn = amountMin ? `less than amountMin estimation ${amountMin.toFixed(decimalPlaces)} ${token}` : `balance is ${resolvedAmount.toFixed(decimalPlaces)} ${token}`;
      const message = `Can't move ${resolvedAmount} ${token} from chain ${from} to ${to}. Reason: ${msgRsn}`;
      const reason = amountMin ? FailReasons.MinAmount : FailReasons.NoBalance;
      return {
        reason,
        message,
        internal: resolvedAmount,
        data: amountMin.toFixed(decimalPlaces)
      };
    }
    if (from === to) {
      return resolvedAmount;
    }

    this.logger.log(`Try transfer ${resolvedAmount.toString()} ${token} from ${from} to ${to}`.blue);
    const sender = await arbWallet.getAddress(from);
    const receiver = await arbWallet.getAddress(to);

    const {
      chainId: originChainId,
      decimals: sentTokenDecimals,
      chainDenom,
    } = balanceMonitor.balances[from].tokenBalances[token].denomInfo;

    const sourceChannel = arbWallet.getTransferChannelId(from, to);
    if (!sourceChannel) {
      this.logger.log(`Transfer error non-existing channel ${JSON.stringify({ from, to })}`.red);
      return {
        reason: FailReasons.IBC,
        data: `Transfer error non-existing channel ${JSON.stringify({ from, to })}`
      };
    }
    let sentTokenDenom;
    if (getChainByChainId(originChainId) === from) {
      sentTokenDenom = chainDenom;
    } else {
      sentTokenDenom = makeIBCMinimalDenom(sourceChannel, chainDenom);
    }
    this.logger.log(`Will transfer ${resolvedAmount} ${token} from (${from}/${sender}) to (${to}/${receiver}) (${sourceChannel})`);

    let unsignedTransferMsg, fee: StdFee;
// if (sentTokenDenom.startsWith('cw20')) {
//   // noinspection SpellCheckingInspection
//   unsignedTransferMsg = {
//     typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
//     value: MsgExecuteContract.fromPartial({
//       sender,
//       contract: sentTokenDenom.split(':')[1],
//       msg: toUtf8(JSON.stringify({
//         'send': {
//           // THE JUNO IBC transfer smart contract address
//           'contract': `juno1v4887y83d6g28puzvt8cl0f3cdhd3y6y9mpysnsp3k8krdm7l6jqgm0rkn`,
//           'amount': '' + getAmountString(token, from, amountToSend),
//           'msg': Buffer.from(JSON.stringify({
//             'channel': sourceChannel,
//             'remote_address': receiver,
//             'timeout': 120,
//           })).toString('base64'),
//         },
//       })),
//     }),
//   };
//   fee = {
//     'gas': '350000',
//     'amount': [
//       {
//         'denom': 'ujuno',
//         'amount': '875',
//       },
//     ],
//   };
// } else {
    const gasFeeInfo = getGasFeeInfo(from, true);

    unsignedTransferMsg = {
      typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
      value: MsgTransfer.fromPartial({
        sourcePort: 'transfer',
        sourceChannel,
        sender,
        receiver,
        token: {
          denom: sentTokenDenom,
          amount: convertCoinToUDenomV2(resolvedAmount, sentTokenDecimals).toString(),
        },
        timeoutHeight: {
          // revisionNumber: // TODO: figure out revision number,
          // revisionHeight: '' + (150 + await getHeight(to)),
        },
        // Nanoseconds
        timeoutTimestamp: getTimeoutTimestamp(),
      }),
    };

    fee = {
      amount: [
        {
          denom: gasFeeInfo.feeCurrency.coinMinimalDenom,
          amount: gasFeeInfo.amount,
        },
      ],
      gas: '350000',
    };
// }

    const client = await arbWallet.getClient(from);
    try {
      const txnStatus = await client.signAndBroadcast(
        sender,
        [unsignedTransferMsg],
        fee,
      );

      try {
        if (!txnStatus.rawLog.includes('denomination trace not found')) {
          // Validate that there is the amount meaning we have good tx
          // tslint:disable-next-line:no-unused-expression
          JSON.parse(JSON.parse(txnStatus.rawLog)[0].events.find(({ type }) => type === 'send_packet').attributes.find(({ key }) => key === 'packet_data').value).amount;
        }
      } catch (err) {
        this.logger.error('Transfer error'.red, txnStatus.rawLog);
        //cleanupClient(from);
        //continue;

        // noinspection ExceptionCaughtLocallyJS
        throw new Error('Transfer Error');
      }
      return resolvedAmount;
    } catch (err) {
      this.logger.error('Transfer general error'.red, err);
      return {
        data: `Transfer general error `,
        reason: err.message
      };
    }
  }

  id(): string {
    return `${this.data.from}-${this.data.to}`;
  }
}
