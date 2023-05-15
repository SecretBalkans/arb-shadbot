import { CHAIN, ChainCurrency, getChainInfo } from '../ibc';
import BigNumber from 'bignumber.js';
const GAS_FEE_STEP: 'low' | 'average' | 'high' = 'low';

export function getGasFeeInfo<B extends boolean>(chain: CHAIN, asRawString?: B): { amount: B extends true ? string : number, feeCurrency: ChainCurrency };
export function getGasFeeInfo(chain: CHAIN, asRawString: boolean = false): { amount: string | number, feeCurrency: ChainCurrency } {
  const chainInfo = getChainInfo(chain);
  const feeCurrency = chainInfo.currencies[0];

  const gasPriceStep = chainInfo.gasPriceStep || feeCurrency.gasPriceStep;
  let amount = gasPriceStep[GAS_FEE_STEP];
  if (amount > 10 ** 5) {
    // HACK: some big decimal coins (INJ,ROWAN,EVMOS,etc.) are given with gasPriceStep in raw decimal amounts
    // ie. 100000....000000 so we divide by coin decimals
    amount = BigNumber(amount).dividedBy(10 ** feeCurrency.coinDecimals).toNumber();
  }
  let stringAmount = BigNumber(amount).multipliedBy(10 ** feeCurrency.coinDecimals).toString();
  return { feeCurrency, amount: asRawString ? stringAmount : amount };
}
