import {getFetchTimeout, Logger} from '../utils';
import {Observable} from 'zen-observable-ts';
import _ from 'lodash';
import {ChainInfos} from '../ibc';
import {Token} from '../ibc/dexTypes';

const logger = new Logger('Prices');
let pricesObservablePromise;
const fetchTimeout = getFetchTimeout({ maxSockets: 1 });
let CACHED_PRICES = {
  "AAVE": 62.01,
  "BLD": 0.177293,
  "AKT": 0.253636,
  "ALTER": 0.02825947,
  "APE": 3.24,
  "AXS": 6.77,
  "BTC": 26833,
  "XCN": 0.00199449,
  "LINK": 6.52,
  "HUAHUA": 0.00006526,
  "CMDX": 0.04593519,
  "ATOM": 10.97,
  "CRE": 0.03608525,
  "CRO": 0.062238,
  "DSM": 0.03195089,
  "DIG": 0.00023106,
  "NGM": 0.0148084,
  "EEUR": 1.041,
  "EVMOS": 0.196704,
  "FURY": 0.00208669,
  "FRAX": 0.996867,
  "GRAV": 0.00448767,
  "INJ": 6.05,
  "IST": 0.999465,
  "ION": 630.41,
  "IRIS": 0.0212937,
  "JUNO": 0.621099,
  "KAVA": 0.933258,
  "KUJI": 0.642044,
  "LUM": 0.00055236,
  "MARBLE": 1.26,
  "NETA": 17.54,
  "OSMO": 0.634689,
  "XPRT": 0.181231,
  "PSTAKE": 0.050028,
  "RAI": 2.79,
  "REGEN": 0.082413,
  "ATOLO": 0.0041533,
  "SCRT": 0.491987,
  "DVPN": 0.00041039,
  "SHD": 6.4,
  "SHIB": 0.00000878,
  "SIENNA": 0.376879,
  "STETH": 1792.95,
  "STARS": 0.01202248,
  "IOV": 0.00568478,
  "STKATOM": 11.72,
  "STKDSCRT": 0.782524,
  "STRD": 1.39,
  "STATOM": 12.47,
  "KRTC": 0.00000927,
  "LUNC": 0.00009103,
  "LUNA": 0.930261,
  "USTC": 0.01474378,
  "USDT": 1,
  "UMEE": 0.00612644,
  "UNI": 5.09,
  "USDC": 1,
  "USDX": 0.807651,
  "USK": 1.033,
  "GLMR": 0.289339
};
export const PRICE_IDS = {
  atom: 'cosmos',
  usdc: 'usd-coin',
  btc: 'bitcoin',
  akt: 'akash-network',
  osmo: 'osmosis',
  cro: 'crypto-com-chain',
  iris: 'iris-network',
  juno: 'juno',
  xprt: 'persistence',
  regen: 'regen',
  dvpn: 'sentinel',
  lunc: 'terra-luna',
  ustc: 'terra-usd',
  scrt: 'secret',
  sienna: 'sienna',
  inj: 'injective',
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function getCoinGeckoMap() {
  return _(ChainInfos).flatMap(({currencies}) => _.map(currencies,
      ({
         coinDenom,
         coinGeckoId,
       }) => {
        return [
          // remove '-' from token names such as stkd-scrt
          coinDenom.replace('-', ''),
          coinGeckoId];
      }))
    .filter(([key]) => !key.includes('.')) // do not include wrapped tokens such as Avalanche.USDC
    .groupBy(d => d[1]) // groupBy coinGeckoId
    .toPairs()
    .filter(([cgId]) => !cgId || !cgId.includes(':'))
    .map(([, pairs]) => {
      return _.minBy(pairs, ([tokenName]) => tokenName.length) // heuristic to choose the shortest representation of a token is probably the real one
    })
    .fromPairs()
    .value();
}

export const PRICE_IDS_ALL = {
  ...PRICE_IDS,
  ...getCoinGeckoMap(),
};
delete PRICE_IDS_ALL['undefined'];

export type Prices = Record<Token, number>;

export async function subscribePrices(): Promise<Observable<Prices>> {
  if (!pricesObservablePromise) {
    pricesObservablePromise = new Promise<Observable<Prices>>(resolve => {
      getPrices().then(prices => {
        const observable = new Observable<Prices>(observer => {
          observer.next(prices);
          setInterval(() => {
            getPrices().then(observer.next.bind(observer));
          }, 5 * 60 * 1000);
        });
        resolve(observable);
      });
    });
  }
  return pricesObservablePromise;
}

export const PRICE_ID_TOKENS = _.invert(PRICE_IDS_ALL);
delete PRICE_ID_TOKENS['undefined'];

async function getPrices(): Promise<Record<string, number>> {
  let prices;
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${_.uniq(_.compact(Object.values(PRICE_IDS_ALL))).join(',')}&vs_currencies=usd`;
    prices = await fetchTimeout(url);
  } catch (err) {
    logger.error(err);
    prices = CACHED_PRICES;
  }
  CACHED_PRICES = prices;
  return _.fromPairs(_.map(prices, (price, key) => {
    const token = PRICE_ID_TOKENS[key];
    return [token?.toUpperCase(), price.usd];
  }));
}
