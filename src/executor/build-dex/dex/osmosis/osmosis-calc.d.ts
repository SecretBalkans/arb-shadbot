import { OptimizedRoutes, StablePoolRaw, WeightedPoolRaw } from "../../lib/@osmosis/packages/pools/src";
import { Pool } from "../../lib/@osmosis/packages/pools/src";
import bigInteger from "big-integer";
import { Int } from "@keplr-wallet/unit";
export default class OsmosisCalc {
    private readonly pools;
    private readonly routers;
    constructor(pools: Pool[]);
    static getPairKey(tokenInDenom: string, tokenOutDenom: string): string;
    getPairRouter(tokenInDenom: string, tokenOutDenom: string): OptimizedRoutes;
    calculateBestOsmosisSwapRoute({ tokenInDenom, tokenInAmount, tokenOutDenom, }: {
        tokenInDenom: string;
        tokenInAmount: bigInteger.BigInteger;
        tokenOutDenom: string;
    }): {
        amount: Int;
        pools: Pool[];
        tokenIn: string;
        tokenOutDenoms: string[];
        out: Int;
    }[];
}
export declare function isStablePool(poolRaw: WeightedPoolRaw | StablePoolRaw): poolRaw is StablePoolRaw;
