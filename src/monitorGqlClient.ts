import {execute, Observable} from "apollo-link";
import {WebSocketLink} from "apollo-link-ws";
import {SubscriptionClient} from "subscriptions-transport-ws";
import ws from "ws";
import gql from "graphql-tag";
import config from './config';
import { Amount, SwapToken, DexProtocolName, isSwapToken } from './ibc/dexTypes';
import BigNumber from 'bignumber.js';

const getWsClient = (wsurl, headers = {}) => new SubscriptionClient(
  wsurl,
  {
    reconnect: true,
    connectionParams: {
      headers
    }
  },
  ws
);
export const createSubscriptionObservable = (wsurl, query, variables, headers = {}) => {
  const link = new WebSocketLink(getWsClient(wsurl, headers));
  return execute(link, {query, variables});
};

export function toRawArbV1(json: ArbV1): ArbV1Raw {
  return {
    amount_bridge: json.amountBridge.toNumber(),
    amount_in: json.amountIn.toNumber(),
    amount_win: json.amountWin.toNumber(),
    amount_out: json.amountOut.toNumber(),
    bridge: '',
    dex_0: json.dex0,
    dex_1: json.dex1,
    id: json.id,
    last_ts: json.lastTs,
    route_0: json.route0,
    route_1: json.route1,
    token_0: json.token0,
    token_1: json.token1,
    ts: json.ts,
  };
}

export interface ArbV1Raw {
  amount_bridge: number,
  amount_in: number,
  amount_win: number,
  amount_out: number
  bridge: any,
  dex_0: string,
  dex_1: string,
  id: string
  last_ts: Date,
  route_0: any[],
  route_1: any[],
  token_0: string,
  token_1: string
  ts: Date
}

const operation = 'arb_v1'
const SUBSCRIBE_QUERY = gql`
    subscription {
        arb_v1 (where: {amount_win: {_gt: 0}}, order_by: { amount_win: desc}, limit: 1000) {
          amount_bridge,
          amount_in,
          amount_win,
          amount_out,
          bridge,
          dex_0,
          dex_1,
          id,
          last_ts,
          route_0,
          token_0,
          route_1,
          token_1,
          ts
      }
    }
`;

export interface ArbV1 {
  amountBridge: Amount,
  amountIn: Amount,
  amountWin: Amount,
  amountOut: Amount
  bridgeCost: Amount,
  winUsd: Amount,
  dex0: DexProtocolName,
  dex1: DexProtocolName,
  id: string
  route0: string[],
  route1: string[],
  token0: SwapToken,
  token1: SwapToken
  lastTs: Date,
  ts: Date
}

export function parseRawArbV1(arb: ArbV1Raw): ArbV1 {
  function validateDexName(dex: string): DexProtocolName {
    if (!['osmosis', 'shade'].includes(dex)) {
      throw new Error(`ParseError unsupported dex ${dex}`);
    }
    return dex as DexProtocolName
  }
  function validateSwapToken(token: string):SwapToken {
    if(isSwapToken(token)) {
      return token
    } else {
      throw new Error(`ParseError unsupported swap token ${token}`);
    }
  }
  return {
    amountBridge: BigNumber(arb.amount_bridge),
    amountIn: BigNumber(arb.amount_in),
    amountWin: BigNumber(arb.amount_win),
    amountOut: BigNumber(arb.amount_out),
    dex0: validateDexName(arb.dex_0),
    dex1: validateDexName(arb.dex_1),
    bridgeCost: null,
    winUsd: null,
    id: arb.id,
    lastTs: new Date(arb.last_ts),
    route0: arb.route_0,
    route1: arb.route_1,
    token0: validateSwapToken(arb.token_0),
    token1: validateSwapToken(arb.token_1),
    ts: new Date(arb.ts),
  };
}

export function subscribeLiveArb(): Observable<ArbV1[]> {
  return new Observable(observer => {
    createSubscriptionObservable(
      config.secrets.monitor.gqlUrl.replace('http', 'ws'), // GraphQL endpoint
      SUBSCRIBE_QUERY,                                       // Subscription query
      {},                                                // Query variables
      {
        'x-hasura-admin-secret': config.secrets.monitor.gqlPassword
      }
    ).subscribe({
      next({data}) {
        observer.next(data[operation].map(parseRawArbV1));
      },
      error: observer.error.bind(observer),
      complete: observer.complete.bind(observer),
    })
  })
}
