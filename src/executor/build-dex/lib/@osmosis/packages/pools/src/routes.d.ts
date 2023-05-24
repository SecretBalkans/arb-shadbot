import { Dec, Int } from "@keplr-wallet/unit";
import { Pool } from "./interface";
export interface Route {
    pools: Pool[];
    tokenOutDenoms: string[];
    tokenInDenom: string;
}
export interface RouteWithAmount extends Route {
    amount: Int;
}
export declare class OptimizedRoutes {
    protected readonly stakeCurrencyMinDenom: string;
    protected _pools: ReadonlyArray<Pool>;
    protected _incentivizedPoolIds: string[];
    protected candidatePathsCache: Map<string, Route[]>;
    constructor(pools: ReadonlyArray<Pool>, incentivizedPoolIds: string[], stakeCurrencyMinDenom: string);
    get pools(): ReadonlyArray<Pool>;
    getCandidateRoutes(tokenInDenom: string, tokenOutDenom: string, maxHops?: number, maxRouteCount?: number): Route[];
    getOptimizedRoutesByTokenIn(tokenIn: {
        denom: string;
        amount: Int;
    }, tokenOutDenom: string, maxPools: number, maxRoutes?: number): RouteWithAmount[];
    calculateTokenOutByTokenIn(routes: RouteWithAmount[]): {
        amount: Int;
        beforeSpotPriceInOverOut: Dec;
        beforeSpotPriceOutOverIn: Dec;
        afterSpotPriceInOverOut: Dec;
        afterSpotPriceOutOverIn: Dec;
        effectivePriceInOverOut: Dec;
        effectivePriceOutOverIn: Dec;
        tokenInFeeAmount: Int;
        swapFee: Dec;
        multiHopOsmoDiscount: boolean;
        priceImpact: Dec;
    };
}
