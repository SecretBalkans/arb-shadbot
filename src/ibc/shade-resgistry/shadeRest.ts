import { fetchTimeout } from '../../utils';
import _ from 'lodash';
import https from 'https';
import {
 Contract
} from './types';


export async function getPegPrice(): Promise<number> {
  return (await fetchTimeout('https://8oa7njf3h7.execute-api.us-east-1.amazonaws.com/prod/peg', {}, 10000)).graphData[0].pegPrice;
}
export let tokens;
export let pairs;

const shadeApiHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 5000,
  maxSockets: 5,
});

export async function initTokens(): Promise<void> {
  tokens = tokens || await fetchTimeout('https://na36v10ce3.execute-api.us-east-1.amazonaws.com/API-mainnet-STAGE/tokens', {
    agent: shadeApiHttpsAgent
  });
}

export interface TokenPairInfoRaw {
  id: string;
  contract: Contract;
  factory: string;
  /**
   * token_0 : "06180689-1c8e-493d-a19f-71dbc5dddbfc"
   * token_0_amount : "132661431360"
   * token_1 : "7524b771-3540-4829-aff1-c6d42b424e61"
   * token_1_amount : "499623041187"
   */
  token_0: string;
  token_0_amount: string;
  token_1: string;
  token_1_amount: string;
  lp_token: string;
  staking_contract: {
    'id': string;
    'address': string;
    'code_hash': string;
  };
  /**
   * {
   *     "a": "150",
   *     "gamma1": "2",
   *     "gamma2": "50",
   *     "min_trade_size_0_to_1": "0.0001",
   *     "min_trade_size_1_to_0": "0.0001",
   *     "max_price_impact_allowed": "1000",
   *     "price_ratio": "0.948439957804714905975629335"
   *   }
   */
  stable_params: {
    'a': string;
    'gamma1': string;
    'gamma2': string;
    'min_trade_size_0_to_1': string;
    'min_trade_size_1_to_0': string;
    'max_price_impact_allowed': string;
    'price_ratio': string;
  };
  volume: {
    'volume': string;
    'volume_24h_change': string;
    'volume_24h_change_perc': string;
  };
  fees: {
    'dao': string;
    'lp': string;
  };
  liquidity: string;
  liquidity_usd: string;
  apy: {
    'total': number;
    'reward_tokens': [
      {
        'token_id': string;
        'apy': number;
        'percentage_of_total': number;
      },
      {
        'token_id': string;
        'apy': number;
        'percentage_of_total': number;
      }
    ];
  };
  currency: string;
  flags: string[]; // derivative/stable
}

export async function initPairsRaw(): Promise<TokenPairInfoRaw[]> {
  pairs = pairs || await fetchTimeout('https://na36v10ce3.execute-api.us-east-1.amazonaws.com/API-mainnet-STAGE/shadeswap/pairs', {
    agent: shadeApiHttpsAgent
  }, 10000);
  return pairs;
}

export function getTokenDecimals(tokenId: string): number {
  return _.find(tokens, { id: tokenId }).decimals;
}
