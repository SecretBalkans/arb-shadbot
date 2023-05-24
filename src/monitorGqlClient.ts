import {execute, Observable} from "apollo-link";
import {WebSocketLink} from "apollo-link-ws";
import {SubscriptionClient} from "subscriptions-transport-ws";
import ws from "ws";
import gql from "graphql-tag";
import config from './config';
import {ArbV1WinRaw} from "./executor/types";

const getWsClient = (webSocketUrl, headers = {}) => new SubscriptionClient(
  webSocketUrl,
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

export function subscribeLiveArb(): Observable<ArbV1WinRaw[]> {
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
        observer.next(data[operation].map((data) => {
          return data;
        }));
      },
      error: observer.error.bind(observer),
      complete: observer.complete.bind(observer),
    })
  })
}
