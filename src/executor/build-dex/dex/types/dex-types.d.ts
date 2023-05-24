import { Observable } from 'rxjs';
import { Pool } from '../../lib/@osmosis/packages/pools/src';
import { ShadePair } from '../shade/shade-api-utils';
import BigNumber from 'bignumber.js';
import { OsmosisRoute } from '../osmosis/types';
import { SerializedShadeRouteSegmentInfo, ShadeRouteSegmentInfo } from "../shade/types";
export type Amount = BigNumber;
export type CoinAmount = BigNumber;
declare const brand: unique symbol;
export type Brand<T, TBrand extends string> = T & {
    [brand]: TBrand;
};
export type Token = Brand<string, 'Token'>;
export type Denom = Brand<string, 'Denom'>;
export type NonArbedToken = Brand<string, 'NonArbedToken'>;
export type NoIBCToken = Brand<string, 'NoIBCToken'>;
export type PoolToken = Token | NonArbedToken | NoIBCToken;
export type PoolId = Brand<string, 'PoolId'>;
export declare function reversePair<T extends SwapToken | PoolToken>(pair: [T, T]): [T, T];
export declare enum SwapToken {
    SHD = "SHD",
    'USDC' = "USDC",
    'USDT' = "USDT",
    CMST = "CMST",
    SILK = "SILK",
    stkdSCRT = "stkdSCRT",
    stkATOM = "stkATOM",
    SCRT = "SCRT",
    stATOM = "stATOM",
    IST = "IST",
    ATOM = "ATOM",
    qATOM = "qATOM",
    stOSMO = "stOSMO",
    stINJ = "stINJ",
    INJ = "INJ",
    OSMO = "OSMO",
    JUNO = "JUNO",
    stJUNO = "stJUNO",
    BLD = "BLD"
}
export declare function isSwapToken(token: string | PoolToken): token is SwapToken;
export declare const SwapTokenMap: Record<SwapToken, Token>;
export interface IPool<T extends DexPool> {
    poolId: PoolId;
    token0Amount: CoinAmount;
    token1Amount: CoinAmount;
    token0Id: PoolToken;
    token1Id: PoolToken;
    dex: DexProtocolName;
    internalPool: T;
}
export type DexProtocolName = 'shade' | 'osmosis';
export declare function isDexProtocolName(dexName: string): dexName is DexProtocolName;
export type Route<T extends DexProtocolName> = T extends 'osmosis' ? OsmosisRoute : (ShadeRouteSegmentInfo[]);
export type SerializedRoute<T extends DexProtocolName> = T extends 'osmosis' ? OsmosisRoute : (SerializedShadeRouteSegmentInfo[]);
export type DexPool = Pool | ShadePair;
export type PoolInfo<T extends DexProtocolName> = T extends 'osmosis' ? Pool : ShadePair;
export declare abstract class DexProtocol<T extends DexProtocolName> implements ICanSwap<T>, ILivePoolStore<T> {
    name: DexProtocolName;
    pools: IPool<PoolInfo<T>>[];
    abstract calcSwapWithPools(amountIn: Amount, tokenInId: Token, tokenOutId: Token, poolsHint: Route<T>): {
        route: Route<T>;
        amountOut: Amount;
    } | null;
    calcSwap(amountIn: Amount, [tokenInId, tokenOutId]: [Token, Token], pools: any): {
        route?: Route<T>;
        amountOut?: Amount;
        internalSwapError: Error | null;
    };
    abstract subscribeToPoolsUpdate(): Observable<{
        pools: IPool<PoolInfo<T>>[];
        height: number;
    }>;
    abstract getPoolsMap(pairs: [SwapToken, SwapToken][]): PoolId[];
}
export interface ICanSwap<T extends DexProtocolName> {
    calcSwapWithPools(amountIn: Amount, tokenInId: Token, tokenOutId: Token, pools: Route<T>): {
        route: Route<T>;
        amountOut: Amount;
    };
    getPoolsMap(pairs: [SwapToken, SwapToken][]): PoolId[];
}
export interface ILivePoolStore<T extends DexProtocolName> {
    name: DexProtocolName;
    pools: IPool<PoolInfo<T>>[];
    subscribeToPoolsUpdate(): Observable<{
        pools: IPool<PoolInfo<T>>[];
        height: number;
    }>;
}
export {};
