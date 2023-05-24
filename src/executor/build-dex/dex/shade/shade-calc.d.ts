import BigNumber from "bignumber.js";
import { Amount, PoolId } from "../types/dex-types";
import { ShadeRoutePoolEssential } from "./types";
export type ShadeRoutePoolEssentialsIdMap = {
    [p: string]: ShadeRoutePoolEssential;
};
export default class ShadeCalc {
    private readonly routePairsById;
    constructor(pairs: ShadeRoutePoolEssentialsIdMap);
    calculatePathQuotaByEnding({ endingTokenAmount: endingTokenAmount, endingTokenId: endingTokenId, path: path, }: {
        endingTokenAmount: any;
        endingTokenId: any;
        path: any;
    }): {
        inputAmount: any;
        quoteOutputAmount: any;
        quoteShadeDaoFee: any;
        quoteLPFee: any;
        priceImpact: any;
        sourceTokenId: any;
        targetTokenId: any;
        route: any;
    };
    calculatePathOutcome({ startingTokenAmount: startingTokenAmount, startingTokenId: startingTokenId, path: path, }: {
        startingTokenAmount: Amount;
        startingTokenId: string;
        path: PoolId[];
    }): {
        inputAmount: BigNumber;
        quoteOutputAmount: any;
        quoteShadeDaoFee: BigNumber;
        quoteLPFee: BigNumber;
        priceImpact: BigNumber;
        sourceTokenId: string;
        targetTokenId: any;
        route: any[];
    };
    private getPoolById;
    private isStablePool;
}
