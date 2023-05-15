import {IArbOperationExecuteResult, IOperationData, SwapOperationType} from './types';
import { fetchTimeout, Logger } from '../utils';
import { Amount, SwapTokenMap, Token } from '../ibc/dexTypes';
import { ArbWallet, getChainUrl, swapTypeUrlOsmo } from '../wallet/ArbWallet';
import { getTokenBaseDenomInfo } from '../ibc/tokens';
import { convertCoinToUDenomV2 } from '../utils/denoms';
import { CHAIN } from '../ibc';
import BigNumber from 'bignumber.js';
import _ from 'lodash';
import { getGasFeeInfo } from './utils';
import Aigle from 'aigle';
import { toBase64 } from '@cosmjs/encoding';
import { ArbOperation } from './aArbOperation';

function getLog({ rawLog }: { rawLog: string }) {
  try {
    return JSON.parse(rawLog)['0'];
  } catch (err) {
    throw new Error(rawLog);
  }
}
export class SwapOperation extends ArbOperation<SwapOperationType> {

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

  override async executeInternal(arbWallet: ArbWallet): Promise<{ success: boolean, result: IArbOperationExecuteResult<SwapOperationType> }> {
    const tokenDenomInfo = getTokenBaseDenomInfo(this.token0);
    const receivedDenomInfo = getTokenBaseDenomInfo(this.token1);
    const slippage = 0.02;
    let minReceivingAmountString = convertCoinToUDenomV2(this.data.expectedReturn.multipliedBy(1 - slippage), receivedDenomInfo.decimals).toString();
    let sentDenom = tokenDenomInfo.baseDenom, receivedDenom;
    let sentAmountString = convertCoinToUDenomV2(this.data.token0Amount, tokenDenomInfo.decimals).toString().split('.')[0];
    this.logger.log(`Swap ${this.data.token0Amount} (${sentAmountString}) ${this.token0} > ${this.token1} in ${this.data.dex}`);
    switch (this.data.dex) {
      case 'osmosis':
        const chainOsmosis = CHAIN.Osmosis;
        const client = await arbWallet.getClient(chainOsmosis);

      function getOsmoResult(result, token: Token): Amount {
        return BigNumber(_.findLast(_.find(getLog(result).events, { type: 'coin_spent' }).attributes, { key: 'amount' }).value.match(/\d+/)[0]).dividedBy(10 ** getTokenBaseDenomInfo(token).decimals);
      }

        const fee = {
          'gas': '500000',
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
                let data = await fetchTimeout(`https://${getChainUrl(chainOsmosis)}/osmosis/gamm/v1beta1/pools/${poolId}`);
                let { pool: { pool_assets: [{ token: { denom: denom1 } }, { token: { denom: denom2 } }] } } = data;
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
              token1ReturnAmount: amountReturned,
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
        const tokenAddress = this.data.route[0].t0.symbol === this.token0 ? this.data.route[0].t0.contract_address : this.data.route[0].t1.contract_address;
        // noinspection JSUnusedLocalSymbols
        const apContractPath = await Aigle.map(this.data.route, async ({ lp, t0, t1 }) => {
          return lp;
        });
        const raw_msg = JSON.stringify(
          {
            swap_tokens_for_exact: {
              expected_return: minReceivingAmountString,
              path: apContractPath.map(d => ({ addr: d.address, code_hash: d.codeHash })),
            },
          },
        );
        const tx = await arbWallet.executeSecretContract(
          tokenAddress,
          {
            send: {
              'recipient': routerAddress,
              'recipient_code_hash': routerHash,
              'amount': sentAmountString,
              'msg': toBase64(Buffer.from(raw_msg, 'ascii')),
              'padding': 'u3a9nScQ',
            },
          },
          0.025, // sometimes fails depending on node used
          2_530_000, // TODO: see shade UI gas fee calculation based on hops
        );
        this.logger.log(tx.rawLog);
        break;
      default:
        this.logger.log();
        return;
    }
  }
}
