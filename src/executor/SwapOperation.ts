import {FailReasons, IArbOperationExecuteResult, IOperationData, SwapOperationType} from './types';
import {fetchTimeout, Logger} from '../utils';
import {Amount, CHAIN, getTokenDenomInfo, SwapTokenMap, Token} from '../ibc';
import {ArbWallet, getChainUrl, swapTypeUrlOsmo} from '../wallet/ArbWallet';
import {getTokenBaseDenomInfo} from '../ibc/tokens';
import {convertCoinToUDenomV2} from '../utils/denoms';
import BigNumber from 'bignumber.js';
import _ from 'lodash';
import {getGasFeeInfo} from './utils';
import Aigle from 'aigle';
import {toBase64} from '@cosmjs/encoding';
import {ArbOperationSequenced} from './aArbOperation';
import {BalanceMonitor} from "../balances/BalanceMonitor";

function getLog({ rawLog }: { rawLog: string }) {
  try {
    return JSON.parse(rawLog)['0'];
  } catch (err) {
    throw new Error(rawLog);
  }
}
export class SwapOperation extends ArbOperationSequenced<SwapOperationType> {

  logger: Logger;

  private readonly token0: Token;

  private readonly token1: Token;

  constructor(data: IOperationData<SwapOperationType>, shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
    this.token0 = SwapTokenMap[this.data.swapTokenSent];
    this.token1 = SwapTokenMap[this.data.swapTokenReceived];
  }

  type() {
    return 'Swap';
  };

  id() {
    return `${SwapTokenMap[this.data.swapTokenSent]}-${SwapTokenMap[this.data.swapTokenReceived]}`;
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean, result: IArbOperationExecuteResult<SwapOperationType> }> {
    const amount = await this.resolveArbOperationAmount({amount: this.data.tokenAmountIn, token: this.data.swapTokenSent}, arbWallet, balanceMonitor);
    if(!(amount instanceof BigNumber)) {
      return {
        success: false,
        result: amount
      }
    }
    const tokenDenomInfo = getTokenBaseDenomInfo(this.token0);
    const receivedDenomInfo = getTokenBaseDenomInfo(this.token1);
    const slippage = 0.02;

    let minReceivingAmountString = '1000' || convertCoinToUDenomV2(this.data.expectedReturn.multipliedBy(1 - slippage) || BigNumber(0.001), receivedDenomInfo.decimals).toFixed(0);
    // TODO: BigNumber(1) hardcoded swap amount to be able to repeat
    let bigNumberAmountResult = BigNumber.minimum(1, amount);
    let sentAmountString =  convertCoinToUDenomV2(bigNumberAmountResult, tokenDenomInfo.decimals).toString().split('.')[0];
    this.logger.log(`Swap ${bigNumberAmountResult.toNumber()} (${sentAmountString}) ${this.token0} > ${this.token1} in ${this.data.dex}`);
    switch (this.data.dex) {
      case 'osmosis':
        const chainOsmosis = CHAIN.Osmosis;
        const client = await arbWallet.getClient(chainOsmosis);

        let sentDenom = arbWallet.makeIBCHash(this.token0, CHAIN.Osmosis),
          receivedDenom = arbWallet.makeIBCHash(this.token1, CHAIN.Osmosis);

      function getOsmoResult(result, token: Token): Amount {
        return BigNumber(_.findLast(_.find(getLog(result).events, { type: 'coin_spent' }).attributes, { key: 'amount' }).value.match(/\d+/)[0]).dividedBy(10 ** getTokenBaseDenomInfo(token).decimals);
      }

        const fee = {
          'gas': '' + this.data.route.length * 25e4,
          'amount': [
            {
              'denom': 'uosmo',
              'amount': getGasFeeInfo(chainOsmosis, true).amount,
            },
          ],
        };
        const sender = await arbWallet.getAddress(chainOsmosis);
        const msgs = [{
          typeUrl: swapTypeUrlOsmo,
          value: {
            'sender': sender,
            'routes': await Aigle.map(this.data.route as string[], async (poolId, i) => {
              let tokenOutDenom;
              if (i === 0) {
                let data = await fetchTimeout(`${getChainUrl(chainOsmosis, true)}/osmosis/gamm/v1beta1/pools/${poolId}`);
                let denom1, denom2;
                if(data.pool.pool_liquidity) {
                  let {pool: {pool_liquidity: [{denom: d1}, {denom: d2}]}} = data;
                  denom1 = d1;
                  denom2 = d2;
                } else {
                  let { pool: { pool_assets: [ { token : { denom: d1 } } , { token : { denom: d2 }}] } } = data;
                  denom1 = d1;
                  denom2 = d2;
                }
                tokenOutDenom = sentDenom === denom1 ? denom2 : denom1;
              } else {
                tokenOutDenom = receivedDenom;
              }
              return ({
                'poolId': '' + poolId,
                'tokenOutDenom': tokenOutDenom,
              });
            }),
            'tokenIn': {
              'denom': sentDenom,
              'amount': sentAmountString,
            },
            //TODO: export calculate code from arbjs to get minReceivingAmountString
            'tokenOutMinAmount': minReceivingAmountString,
          },
        }];
        let result, lastMessage;
        try {
          if (msgs.length > 0) {
            result = await client.signAndBroadcast(
              sender,
              msgs,
              fee,
            );
          } else {
            // noinspection ExceptionCaughtLocallyJS
            throw new Error('No msgs initialized for swap');
          }
          const amountReturned = getOsmoResult(result, this.token1);
          return {
            success: true,
            result: {
              amount: amountReturned,
            },
          };
        } catch (err) {
          if (err.name !== 'SyntaxError') {
            let log;
            try {
              log = JSON.parse(result?.rawLog || '');
            } catch (err) {
              log = result?.rawLog || result || '';
            }
            if (!result?.rawLog.includes('threshold')) {
              // noinspection JSUnusedAssignment
              this.logger.error(err, result);
            }
            this.shouldLogInDetails && this.logger.error('Unknown swap error'.red, JSON.stringify({
              log,
              msg: msgs[0] || lastMessage,
              err: { message: err.message, stack: err.stack },
            }));
          } else {
            this.shouldLogInDetails && this.logger.error('Swap chain error'.red, JSON.stringify({
              log: JSON.parse(result?.rawLog || ''),
              msgs,
            }));
          }
          return {
            success: false,
            result: null,
          };
        }
      case 'shade':
        const routerHash = '448e3f6d801e453e838b7a5fbaa4dd93b84d0f1011245f0d5745366dadaf3e85';
        const routerAddress = 'secret1pjhdug87nxzv0esxasmeyfsucaj98pw4334wyc';
        // TODO: fix the route to give swap token symbols and not sSCRT or other prefixed
        const tokenAddress = _.trimStart(this.data.route[0].t0.symbol, 's') === this.token0 ? this.data.route[0].t0.contract_address : this.data.route[0].t1.contract_address;
        // noinspection JSUnusedLocalSymbols
        const apContractPath = await Aigle.map(this.data.route, async ({ lp, t0, t1 }) => {
          return lp;
        });
        const raw_msg = JSON.stringify(
          {
            swap_tokens_for_exact: {
              expected_return: '1000' ||minReceivingAmountString,
              path: apContractPath.map(d => ({ addr: d.address, code_hash: d.codeHash })),
            },
          },
        );
        const tx = await arbWallet.executeSecretContract(
          {
            contractAddress: tokenAddress, msg: {
              send: {
                'recipient': routerAddress,
                'recipient_code_hash': routerHash,
                'amount': sentAmountString,
                'msg': toBase64(Buffer.from(raw_msg, 'ascii')),
                'padding': 'u3a9nScQ',
              },
            }, gasPrice: 0.0195, gasLimit: 65e4 * (0.4 + apContractPath.length)
          }, // TODO: see shade UI gas fee calculation based on hops
        );
        try {
          let findLast = _.findLast(tx.arrayLog, {key: "amount_out"});
          let token1ReturnAmount = convertCoinToUDenomV2(findLast.value, getTokenDenomInfo(this.token1).decimals);
          return {
            success: true,
            result: {
              data: tx.rawLog,
              amount: token1ReturnAmount
            }
          }
        } catch(err) {
          return {
            success: false,
            result: {
              data: tx.rawLog,
              reason: FailReasons.Unhandled
            }
          }
        }
      default:
        this.logger.log('Unknown dex');
        return;
    }
  }
}
