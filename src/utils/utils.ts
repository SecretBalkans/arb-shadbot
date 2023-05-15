import fetch from 'node-fetch';
import * as https from 'https';
import { safeJsonStringify } from './safe-json-stringify';
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function httpsAgent(maxSockets = 15) {
  return new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: maxSockets,
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function httpAgent(maxSockets = 15) {
  return new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: maxSockets,
  });
}

export function getFetchTimeout({ https= true, maxSockets= 15} = {}) {
  if(https) {
    const agent = httpsAgent(maxSockets);
    return async (url: string, options?, timeout?) => {
      return fetchTimeout(url, {
        ...options,
        agent,
      }, timeout)
    }
  } else {
    const agent = httpAgent(maxSockets);
    return async (url: string, options?, timeout?) => {
      return fetchTimeout(url, {
        ...options,
        agent,
      }, timeout)
    }
  }
}

export async function fetchTimeout(url: string, options = {}, timeout = 14000): Promise<any> {
  let text;
  try {
    text = await (await Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeout),
      ),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
    ]))?.text();
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Fetch error: ${safeJsonStringify({ url, options, text, message: (err as any).message })}`);
  }
}
