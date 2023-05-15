import { StdSignDoc } from 'secretjsbeta/dist/wallet_amino';
import { toUtf8 } from '@cosmjs/encoding';
import { SignDoc } from 'secretjsbeta/dist/protobuf/cosmos/tx/v1beta1/tx';

function sortedObject(obj: any): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortedObject);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  // NOTE: Use forEach instead of reduce for performance with large objects eg Wasm code
  sortedKeys.forEach((key) => {
    result[key] = sortedObject(obj[key]);
  });
  return result;
}

/** Returns a JSON string with objects sorted by key, used for Amino signing */
function JsonSortedStringify(obj: any): string {
  return JSON.stringify(sortedObject(obj));
}

export function serializeStdSignDoc(signDoc: StdSignDoc): Uint8Array {
  return toUtf8(JsonSortedStringify(signDoc));
}


export async function serializeSignDoc({
                                  account_number,
                                  auth_info_bytes,
                                  body_bytes,
                                  chain_id,
                                }: SignDoc): Promise<Uint8Array> {
  return SignDoc.encode(
    SignDoc.fromPartial({
      account_number: account_number,
      auth_info_bytes: auth_info_bytes,
      body_bytes: body_bytes,
      chain_id: chain_id,
    }),
  ).finish();
}
