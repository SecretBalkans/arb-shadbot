import https from "http";
import http from "http";
import { fetchTimeout } from "../utils";
import { print } from 'graphql/language/printer';

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

export const execute = async (operation, variables = {}) => {
  return await fetchTimeout(
    v1GraphqlUrl,
    {
      agent,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // 'x-hasura-admin-secret': hasuraPass,
      },
      body: JSON.stringify({
        query: typeof operation === 'string' ? operation : print(operation),
        variables,
      }),
    },
  );
};
