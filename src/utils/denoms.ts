// noinspection CommaExpressionJS
import BigNumber from 'bignumber.js';
import { Buffer } from 'buffer';
import { sha256 } from '@cosmjs/crypto';

export const convertCoinToUDenomV2 = (input: string | number | BigNumber, decimals: number): BigNumber => {
  return typeof input == 'string' || typeof input == 'number' ?
    BigNumber(input)
      .multipliedBy(BigNumber(10).pow(decimals)) :
    BigNumber(input.toString()).multipliedBy(BigNumber(10).pow(decimals));
};
export const convertCoinFromUDenomV2 = (input: string | BigNumber,decimals:number): BigNumber =>(BigNumber.config({
  DECIMAL_PLACES: 18
}),BigNumber(input.toString()).dividedBy(BigNumber(10).pow(decimals)))

export function makeIBCMinimalDenom(
  sourceChannelId: string,
  coinMinimalDenom: string
): string {
  return (
    "ibc/" +
    Buffer.from(
        sha256(
          Buffer.from(`transfer/${sourceChannelId}/${coinMinimalDenom}`)
        )
      )
      .toString("hex")
      .toUpperCase()
  );
}
