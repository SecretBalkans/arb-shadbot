import https from "http";
import http from "http";
import { fetchTimeout } from "../utils";
import { print } from 'graphql/language/printer';
import {Observable} from "apollo-link";
import {createSubscriptionObservable} from "../monitorGqlClient";
import gql from "graphql-tag";

const v1GraphqlUrl = 'http://127.0.0.1:8080/v1/graphql';

let agent;
if (v1GraphqlUrl.startsWith('https')) {
  agent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxSockets: 20,
  });
} else {
  agent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxSockets: 10,
  });
}
export function subscribeBotStatus(id: string): Observable<{id: string, name:string, status: boolean}> {
  return new Observable(observer => {
    createSubscriptionObservable(
      v1GraphqlUrl.replace('http', 'ws'), // GraphQL endpoint
      gql`
          subscription ($id: uuid!) {
              bot_v1 (where: {id: {_eq: $id}}) {
                  id
                  name
                  status
                  reported_status
              }
          }
      `,          // Subscription query
      {
        id
      },       // Query variables
    ).subscribe({
      next({data}) {
        observer.next(data.bot_v1[0]);
      },
      error: observer.error.bind(observer),
      complete: observer.complete.bind(observer),
    })
  })
}

export function updateBotReportedStatus(id: string, reportedStatus: string) {
  return execute(gql`
      mutation {
          update_bot_v1(where: {id: {_eq: "${id}"}}, _set: {reported_status: "${reportedStatus}"}) {
              affected_rows
              returning {
                  id
                  status
                  reported_status
              }
          }
      }
  `)
}
export function updateSupervisorReportedTs(id: string) {
  return execute(gql`
      mutation {
          update_bot_v1(where: {id: {_eq: "${id}"}}, _set: { supervisor_reported_ts: "${new Date().toJSON()}" }) {
              affected_rows
              returning {
                  id
                  status
                  supervisor_reported_ts
              }
          }
      }
  `)
}

export const execute = async (operation, variables = {}) => {
  return await fetchTimeout(
    v1GraphqlUrl,
    {
      agent,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: typeof operation === 'string' ? operation : print(operation),
        variables,
      }),
    },
  );
};
