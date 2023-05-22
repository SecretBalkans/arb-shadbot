import {FailReasons, IArbOperationExecuteResult, IBCOperationType, IFailingArbInfo, IOperationData} from './types';
import {addressSafeString, Logger} from '../utils';
import {ArbWallet, IBCChannel} from '../wallet/ArbWallet';
import BigNumber from 'bignumber.js';
import {Amount, CHAIN, getChainByChainId, getTokenDenomInfo, SwapToken, SwapTokenMap} from '../ibc';
import {convertCoinToUDenomV2, makeIBCMinimalDenom} from '../utils/denoms';
import {StdFee} from '@cosmjs/stargate';
import {MsgTransfer} from 'cosmjs-types/ibc/applications/transfer/v1/tx';
import {BalanceMonitor} from '../balances/BalanceMonitor';
import {getGasFeeInfo} from "./utils";
import {ArbOperationSequenced} from "./aArbOperation";
import InjectiveClient from "../wallet/clients/InjectiveClient";
import * as injectiveTs from '@injectivelabs/sdk-ts'
import { BigNumberInBase } from "@injectivelabs/utils";
import {toBase64} from "@cosmjs/encoding";
import { ChainRestTendermintApi } from '@injectivelabs/sdk-ts';

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


export class IBCTransferOperation extends ArbOperationSequenced<IBCOperationType> {
  type() {
    return 'IBC';
  };

  logger: Logger;

  id(): string {
    return `${this.data.from}-${this.data.to}_${this.data.isWrapped ? '(wrapped)' : ''}.${this.data.token}`;
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
      const result = await this.transferIBC({
        ...this.data,
        amount: resolvedAmount,
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

  protected async transferIBC({
                                amount,
                                to,
                                token,
                                from,
                                depositAddress,
                                isWrapped = false
                              }: {
                                from: CHAIN,
                                to: CHAIN,
                                amount: Amount,
                                token: SwapToken
                                depositAddress?: string,
                                isWrapped?: boolean
                              }
    , arbWallet: ArbWallet): Promise<Amount | IFailingArbInfo> {
    if (from === to) {
      return amount;
    }

    this.logger.log(`Try transfer ${amount.toString()} ${token} from ${from} to ${to}`.blue);
    const sender = await arbWallet.getAddress(from);
    const receiver = depositAddress || await arbWallet.getAddress(to);
    const senderSafe = addressSafeString(sender);
    const receiverSafe = addressSafeString(receiver);
    const {
      chainId: originChainId,
      decimals: sentTokenDecimals,
      chainDenom
    } = getTokenDenomInfo(SwapTokenMap[token]);

    let sourceChannel = arbWallet.getTransferChannelId(from, to);
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
    let sentAmountString = convertCoinToUDenomV2(amount, sentTokenDecimals).toString();

    if (isWrapped) { // always isWrapped when using Axlr
      if (from === CHAIN.Axelar && to === CHAIN.Secret) {
        //http://secretnetwork-mainnet-lcd.autostake.com:1317/ibc/core/channel/v1/channels?pagination.limit=1000
        /**
         * {
         *       "state": "STATE_OPEN",
         *       "ordering": "ORDER_UNORDERED",
         *       "counterparty": { << we are here when doing from AXELAR >>
         *         "port_id": "transfer",
         *         "channel_id": "channel-69"
         *       },
         *       "connection_hops": [
         *         "connection-93"
         *       ],
         *       "version": "ics20-1",
         *       "port_id": "wasm.secret1yxjmepvyl2c25vnt53cr2dpn8amknwausxee83",
         *       "channel_id": "channel-61" << we are here when doing from SCRT - if block below>>
         *     }
         */
        sourceChannel = 'channel-69' as IBCChannel // from axelar to secret

        this.logger.log(`Will do IBC transfer ${amount} ${token} from (${from}/${senderSafe}) to (${to}/${receiverSafe}) (ics.${sourceChannel} which uses wrapping contract)`);
      } else if (from === CHAIN.Secret && to === CHAIN.Axelar) {
        let result;
        try {
          //http://secretnetwork-mainnet-lcd.autostake.com:1317/ibc/core/channel/v1/channels?pagination.limit=1000
          const icsChannel = 'channel-61' // to axelar
          this.logger.log(`Will execute secret IBC transfer ${amount} ${token} from (${from}/${senderSafe}) to (${to}/${receiverSafe}) (ics.${icsChannel} using contract secret1yxjmepvyl2c25vnt53cr2dpn8amknwausxee83)`);
          result = await arbWallet.executeSecretContract({
            contractAddress: arbWallet.getSecretAddress(token).address,
            msg: {
              send: {
                "recipient": "secret1yxjmepvyl2c25vnt53cr2dpn8amknwausxee83",
                "recipient_code_hash": "2976a2577999168b89021ecb2e09c121737696f71c4342f9a922ce8654e98662",
                "amount": sentAmountString,
                "msg": toBase64(Buffer.from(JSON.stringify({
                  "channel": icsChannel,
                  "remote_address": receiver,
                  "timeout": 600
                }), 'ascii'))
              }
            },
            gasLimit: 350_000,
            gasPrice: getGasFeeInfo(CHAIN.Secret).feeCurrency.gasPriceStep.low
          })
          if(result.code) {
            throw new Error(JSON.stringify(result.rawLog, null, 4))
          }
          return amount;
        } catch (err) {
          return {
            internal: {
              tx: result,
              remote_address: receiver,
            },
            reason: FailReasons.Unhandled,
            data: err.message,
            message: `Secret withdrawal failed ${token}. ${err.message}`
          }
        }
      } else {
        return {
          reason: FailReasons.IBC,
          data: `Chain.${from} not implemented for wrapped transfer`
        }
      }
    } else {
      this.logger.log(`Will transfer ${amount} ${token} from (${from}/${senderSafe}) to (${to}/${receiverSafe}) (${sourceChannel})`);
    }
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
          amount: sentAmountString,
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
    let txnStatus, error;
    for (let i = 0; i < 3; i++) {
      try {
        if (from === CHAIN.Injective) {
          const injectiveClient = new InjectiveClient({
            privateHex: arbWallet.config.privateHex,
            mnemonic: arbWallet.config.mnemonic
          });
          /* get the latestBlock from the origin chain */

          const tendermintRestApi = new ChainRestTendermintApi(injectiveClient.restEndpoint);

          /* Block details from the origin chain */
          const latestBlock = await tendermintRestApi.fetchLatestBlock();
          const latestHeight = latestBlock.header.height;
          const timeoutHeight = new BigNumberInBase(latestHeight).plus(
            30 // default block timeout height
          );

          const msg = injectiveTs.MsgTransfer.fromJSON({
            amount: {
              amount: sentAmountString,
               denom: sentTokenDenom,
            },
            timeout: getTimeoutTimestamp(),
            height: {
              revisionHeight: timeoutHeight.toNumber(),
              revisionNumber: parseInt(latestBlock.header.version.block, 10),
            },
            sender,
            receiver,
            channelId: sourceChannel,
            port: "transfer"
          });
          txnStatus = await injectiveClient.broadcastTransaction(msg)
        } else {
          const client = await arbWallet.getClient(from);
          txnStatus = await client.signAndBroadcast(
            sender,
            [unsignedTransferMsg],
            fee,
          );
        }
        break;
      } catch (err) {
        this.logger.error(`Transfer general error ${from}`.red, err);
        error = err;
      }
    }
    if (error) {
      return {
        data: error.message,
        reason: FailReasons.IBC
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
}
