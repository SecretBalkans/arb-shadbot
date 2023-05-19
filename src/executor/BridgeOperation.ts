import {
  BridgeOperationType,
  FailReasons,
  IArbOperationExecuteResult,
  IFailingArbInfo,
  IOperationData
} from './types';
import {Logger} from '../utils';
import {ArbWallet} from '../wallet/ArbWallet';
import BigNumber from 'bignumber.js';
import {CHAIN, getChainByChainId, getTokenDenomInfo, SwapToken, SwapTokenMap} from '../ibc';
import {convertCoinToUDenomV2, makeIBCMinimalDenom} from '../utils/denoms';
import {StdFee} from '@cosmjs/stargate';
import {MsgTransfer} from 'cosmjs-types/ibc/applications/transfer/v1/tx';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {getGasFeeInfo} from "./utils";
import {Amount} from "../ibc";
import {ArbOperationSequenced} from "./aArbOperation";
import InjectiveClient from "../wallet/clients/InjectiveClient";

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


export class BridgeOperation extends ArbOperationSequenced<BridgeOperationType> {
  type() {
    return 'Bridge';
  };

  logger: Logger;

  constructor(data: IOperationData<BridgeOperationType>, shouldLogDetails: boolean = true) {
    super(data, shouldLogDetails);
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean, result: IArbOperationExecuteResult<BridgeOperationType> }> {
    let resolvedAmount = await this.resolveArbOperationAmount({
      amount: this.data.amount,
      token: this.data.token
    }, arbWallet, balanceMonitor);
    if (resolvedAmount instanceof BigNumber) {
      const result = await this.transferIBC({
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

  private async transferIBC({
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
    if (from === to) {
      return amount;
    }

    this.logger.log(`Try transfer ${amount.toString()} ${token} from ${from} to ${to}`.blue);
    const sender = await arbWallet.getAddress(from);
    const receiver = await arbWallet.getAddress(to);

    const {
      chainId: originChainId,
      decimals: sentTokenDecimals,
      chainDenom
    } = getTokenDenomInfo(SwapTokenMap[token]);

    const sourceChannel = arbWallet.getTransferChannelId(from, to);
    if (!sourceChannel) {
      this.logger.log(`Transfer error non-existing channel ${JSON.stringify({from, to})}`.red);
      return {
        reason: FailReasons.IBC,
        data: `Transfer error non-existing channel ${JSON.stringify({from, to})}`
      };
    }
    let sentTokenDenom;
    if (getChainByChainId(originChainId) === from) {
      sentTokenDenom = chainDenom;
    } else {
      sentTokenDenom = makeIBCMinimalDenom(sourceChannel, chainDenom);
    }
    this.logger.log(`Will transfer ${amount} ${token} from (${from}/${sender}) to (${to}/${receiver}) (${sourceChannel})`);

    /*if (from === CHAIN.Secret && sentTokenDenom) {
      let info = arbWallet.getSecretAddress(token);
      await arbWallet.executeSecretContract(info.address, {
        "redeem": {
          "amount": amount,
          "denom": sentTokenDenom
        }
      }, 0.015, 130000)
    }
*/
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
          amount: convertCoinToUDenomV2(amount, sentTokenDecimals).toString(),
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
    let txnStatus;

    try {
      if (from === CHAIN.Injective) {
        const injectiveClient = new InjectiveClient({
          privateHex: arbWallet.config.privateHex,
          mnemonic: arbWallet.config.mnemonic
        });
        txnStatus = await injectiveClient.broadcastTransaction([unsignedTransferMsg])
      } else {
        const client = await arbWallet.getClient(from);
        txnStatus = await client.signAndBroadcast(
          sender,
          [unsignedTransferMsg],
          fee,
        );
      }
    } catch (err) {
      this.logger.error('Transfer general error'.red, err);
      return {
        data: `Transfer general error `,
        reason: err.message
      };
    }

    try {
      if (!txnStatus.rawLog.includes('denomination trace not found')) {
        // Validate that there is the amount meaning we have good tx
        // tslint:disable-next-line:no-unused-expression
        JSON.parse(JSON.parse(txnStatus.rawLog)[0].events.find(({type}) => type === 'send_packet').attributes.find(({key}) => key === 'packet_data').value).amount;
      } else {
        throw new Error('Wrong channel ?!')
      }
    } catch (err) {
      this.logger.error('Transfer error'.red, txnStatus.rawLog);
      //cleanupClient(from);
      //continue;

      // noinspection ExceptionCaughtLocallyJS
      throw new Error('Transfer Error');
    }
    return amount;

  }

  id()
    :
    string {
    return `${this.data.from}-${this.data.to}`;
  }
}
