import BigNumber from 'bignumber.js';
import bigInteger from 'big-integer';
import { Amount, Brand } from '../dex/types/dex-types';
export type IBCHash = Brand<string, "IBCHash">;
export declare const convertCoinToUDenomV2: (input: string | number | bigInteger.BigInteger | BigNumber, decimals: number) => Amount;
export declare const convertCoinFromUDenomV2: (input: string | bigInteger.BigInteger | BigNumber, decimals: number) => Amount;
export declare function makeIBCMinimalDenom(sourceChannelId: string, coinMinimalDenom: string): IBCHash;
