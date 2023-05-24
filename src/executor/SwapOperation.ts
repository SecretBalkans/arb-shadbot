import {
  Amount,
  FailReasons,
  IArbOperationExecuteResult,
  IOperationData,
  SwapOperationType,
  SwapToken
} from './types';
import {fetchTimeout, Logger} from '../utils';
import {CHAIN, getTokenDenomInfo} from '../ibc';
import {ArbWallet, getChainUrl, swapTypeUrlOsmo} from '../wallet/ArbWallet';
import {getTokenBaseDenomInfo} from '../ibc/tokens';
import BigNumber from 'bignumber.js';
import _ from 'lodash';
import {getGasFeeInfo} from './utils';
import Aigle from 'aigle';
import {toBase64} from '@cosmjs/encoding';
import {ArbOperationSequenced} from './aArbOperation';
import {BalanceMonitor} from "../balances/BalanceMonitor";

import calculateTokenSwap, {SwapTokenMap} from "./build-dex/dexSdk"
import {ShadeContractJson, ShadeRouteSegmentInfo} from "./build-dex/dex/shade/types";
import {convertCoinToUDenomV2} from './build-dex/utils';
import {OsmosisRoute} from './build-dex/dex/osmosis/types';

function getLog({rawLog}: { rawLog: string }) {
  try {
    return JSON.parse(rawLog)['0'];
  } catch (err) {
    throw new Error(rawLog);
  }
}

export class SwapOperation extends ArbOperationSequenced<SwapOperationType> {

  logger: Logger;

  private readonly token0: SwapToken;

  private readonly token1: SwapToken;

  constructor(data: IOperationData<SwapOperationType>, shouldLogInDetails: boolean = true) {
    super(data, shouldLogInDetails);
    this.token0 = this.data.tokenSent;
    this.token1 = this.data.tokenReceived;
  }

  type() {
    return 'Swap';
  };

  id() {
    return `${this.data.dex}.${this.data.tokenSent}-${this.data.tokenReceived}`;
  }

  override async executeInternal(arbWallet: ArbWallet, balanceMonitor: BalanceMonitor): Promise<{ success: boolean, result: IArbOperationExecuteResult<SwapOperationType> }> {
    const amount = await this.resolveArbOperationAmount({
      amount: this.data.tokenAmountIn,
      token: this.data.tokenSent
    }, arbWallet, balanceMonitor);
    if (!(BigNumber.isBigNumber(amount))) {
      return {
        success: false,
        result: amount
      }
    }
    const tokenDenomInfo = getTokenBaseDenomInfo(SwapTokenMap[this.token0]);
    const receivedDenomInfo = getTokenBaseDenomInfo(SwapTokenMap[this.token1]);
    const slippage = 0.02;

    const bigNumberAmountSent = amount;
    let expectedReturn = calculateTokenSwap(this.data.dex, this.data.tokenSent, this.data.tokenReceived, this.data.route, amount);
    let minReceivingAmountString = convertCoinToUDenomV2(expectedReturn.multipliedBy(1 - slippage), receivedDenomInfo.decimals).toFixed(0);
    let sentAmountString = convertCoinToUDenomV2(bigNumberAmountSent, tokenDenomInfo.decimals).toFixed(0);
    this.logger.log(`Swap ${bigNumberAmountSent.toNumber()} (${sentAmountString}) ${this.token0} > ${expectedReturn.toNumber()} (${minReceivingAmountString}) ${this.token1} in ${this.data.dex}`);
    switch (this.data.dex) {
      case 'osmosis':
        const chainOsmosis = CHAIN.Osmosis;
        const client = await arbWallet.getClient(chainOsmosis);

        let sentDenom = arbWallet.makeIBCHash(SwapTokenMap[this.token0], CHAIN.Osmosis),
          receivedDenom = arbWallet.makeIBCHash(SwapTokenMap[this.token1], CHAIN.Osmosis);

      function getOsmoResult(result, token: SwapToken): Amount {
        return BigNumber(_.findLast(_.find(getLog(result).events, {type: 'coin_spent'}).attributes, {key: 'amount'}).value.match(/\d+/)[0]).dividedBy(10 ** getTokenBaseDenomInfo(SwapTokenMap[token]).decimals);
      }

        const osmosisRoute = this.data.route as OsmosisRoute;
        const fee = {
          'gas': '' + osmosisRoute.raws.length * 25e4,
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
            'routes': await Aigle.map(osmosisRoute.raws.map(r => r.id) as string[], async (poolId, i) => {
              let tokenOutDenom;
              if (i === 0) {
                let data = await fetchTimeout(`${getChainUrl(chainOsmosis, true)}/osmosis/gamm/v1beta1/pools/${poolId}`);
                let denom1, denom2;
                if (data.pool.pool_liquidity) {
                  let {pool: {pool_liquidity: [{denom: d1}, {denom: d2}]}} = data;
                  denom1 = d1;
                  denom2 = d2;
                } else {
                  let {pool: {pool_assets: [{token: {denom: d1}}, {token: {denom: d2}}]}} = data;
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
              err: {message: err.message, stack: err.stack},
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
        // noinspection SpellCheckingInspection
        const routerHash = '448e3f6d801e453e838b7a5fbaa4dd93b84d0f1011245f0d5745366dadaf3e85';
        // noinspection SpellCheckingInspection
        const routerAddress = 'secret1pjhdug87nxzv0esxasmeyfsucaj98pw4334wyc';
        const shadeRoute = this.data.route as ShadeRouteSegmentInfo[];
        let firstSegmentInfo = shadeRoute[0] as ShadeRouteSegmentInfo;
        const swapTokenAddress = firstSegmentInfo.t0.symbol === this.token0 ? firstSegmentInfo.t0.contract_address : firstSegmentInfo.t1.contract_address;
        // noinspection JSUnusedLocalSymbols
        const apContractPath = await Aigle.map<ShadeRouteSegmentInfo, ShadeContractJson>(shadeRoute, async (route) => {
          return route.raw.contract;
        });
        const raw_msg = JSON.stringify(
          {
            swap_tokens_for_exact: {
              expected_return: minReceivingAmountString,
              path: apContractPath.map(d => ({addr: d.address, code_hash: d.codeHash})),
            },
          },
        );
        const gasPrice: number = getGasFeeInfo(CHAIN.Secret).amount;
        const tx = await arbWallet.executeSecretContract(
          {
            contractAddress: swapTokenAddress, msg: {
              send: {
                'recipient': routerAddress,
                'recipient_code_hash': routerHash,
                'amount': sentAmountString,
                'msg': toBase64(Buffer.from(raw_msg, 'ascii')),
                'padding': 'u3a9nScQ',
              },
            }, gasPrice, gasLimit: 70e4 * (0.75 + apContractPath.length)
          },
        );
        try {
          let findLast = _.findLast(tx.arrayLog, {key: "amount_out"});
          let token1ReturnAmount = convertCoinToUDenomV2(findLast.value, getTokenDenomInfo(SwapTokenMap[this.token1]).decimals);
          return {
            success: true,
            result: {
              internal: tx.jsonLog,
              data: tx.transactionHash,
              amount: token1ReturnAmount
            }
          }
        } catch (err) {
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
