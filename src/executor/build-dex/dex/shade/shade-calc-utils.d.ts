import BigNumber from 'bignumber.js';
import { ShadeRoutePoolEssential } from "./types";
export declare function findShadePaths({ startingTokenId: startingTokenId, endingTokenId: endingTokenId, maxHops: maxHops, pools: pools, }: {
    startingTokenId: string;
    endingTokenId: string;
    maxHops: number;
    pools: Record<string, ShadeRoutePoolEssential>;
}): any[];
export declare function printShadeSwapRoute(route: ShadeSwapRoute): void;
export interface ShadeSwapRoute {
    inputAmount: BigNumber;
    quoteOutputAmount: BigNumber;
    quoteShadeDaoFee: BigNumber;
    quoteLPFee: BigNumber;
    priceImpact: BigNumber;
    sourceTokenId: string;
    targetTokenId: string;
    route: ShadeRoutePoolEssential[];
}
export declare function stableSwapToken0ToToken1InPool(stablePoolParams: {
    inputToken0Amount: BigNumber;
    poolToken0Amount: BigNumber;
    poolToken1Amount: BigNumber;
    priceRatio: BigNumber;
    a: any;
    gamma1: any;
    gamma2: any;
    liquidityProviderFee: any;
    daoFee: any;
    minTradeSizeToken0For1: any;
    minTradeSizeToken1For0: any;
    priceImpactLimit: any;
}): any;
/** PriceImpact */
export declare function calculateStableSwapPriceImpactInputToken0({ inputToken0Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }: {
    inputToken0Amount: any;
    poolToken0Amount: any;
    poolToken1Amount: any;
    priceRatio: any;
    a: any;
    gamma1: any;
    gamma2: any;
    liquidityProviderFee: any;
    daoFee: any;
    minTradeSizeToken0For1: any;
    minTradeSizeToken1For0: any;
    priceImpactLimit: any;
}): any;
export declare function stableSwapToken1ToToken0InPool({ inputToken1Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }: {
    inputToken1Amount: any;
    poolToken0Amount: any;
    poolToken1Amount: any;
    priceRatio: any;
    a: any;
    gamma1: any;
    gamma2: any;
    liquidityProviderFee: any;
    daoFee: any;
    minTradeSizeToken0For1: any;
    minTradeSizeToken1For0: any;
    priceImpactLimit: any;
}): any;
export declare function calculateStableSwapPriceImpactInputToken1({ inputToken1Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }: {
    inputToken1Amount: any;
    poolToken0Amount: any;
    poolToken1Amount: any;
    priceRatio: any;
    a: any;
    gamma1: any;
    gamma2: any;
    liquidityProviderFee: any;
    daoFee: any;
    minTradeSizeToken0For1: any;
    minTradeSizeToken1For0: any;
    priceImpactLimit: any;
}): any;
export declare function Fo({ token0LiquidityAmount: i, token1LiquidityAmount: e, token0InputAmount: t, fee: n }: {
    token0LiquidityAmount: any;
    token1LiquidityAmount: any;
    token0InputAmount: any;
    fee: any;
}): BigNumber;
export declare function calculateXYKPriceImpactFromToken0Amount({ token0LiquidityAmount: i, token1LiquidityAmount: e, token0InputAmount: t, }: {
    token0LiquidityAmount: any;
    token1LiquidityAmount: any;
    token0InputAmount: any;
}): any;
export declare function Ro({ token0LiquidityAmount: i, token1LiquidityAmount: e, token1InputAmount: t, fee: n }: {
    token0LiquidityAmount: any;
    token1LiquidityAmount: any;
    token1InputAmount: any;
    fee: any;
}): BigNumber;
export declare function calculateXYKPriceImpactFromToken1Amount({ token0LiquidityAmount: i, token1LiquidityAmount: e, token1InputAmount: t, }: {
    token0LiquidityAmount: any;
    token1LiquidityAmount: any;
    token1InputAmount: any;
}): any;
export declare function getTradeInputOfSimulateReverseToken0WithToken1Trade({ outputToken1Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }: {
    outputToken1Amount: any;
    poolToken0Amount: any;
    poolToken1Amount: any;
    priceRatio: any;
    a: any;
    gamma1: any;
    gamma2: any;
    liquidityProviderFee: any;
    daoFee: any;
    minTradeSizeToken0For1: any;
    minTradeSizeToken1For0: any;
    priceImpactLimit: any;
}): any;
export declare function getTradeInputOfSimulateReverseToken1WithToken0Trade({ outputToken0Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }: {
    outputToken0Amount: any;
    poolToken0Amount: any;
    poolToken1Amount: any;
    priceRatio: any;
    a: any;
    gamma1: any;
    gamma2: any;
    liquidityProviderFee: any;
    daoFee: any;
    minTradeSizeToken0For1: any;
    minTradeSizeToken1For0: any;
    priceImpactLimit: any;
}): any;
export declare function calculateXYKToken0AmountFromToken1Amount({ token0LiquidityAmount: i, token1LiquidityAmount: e, token1OutputAmount: t, fee: n, }: {
    token0LiquidityAmount: any;
    token1LiquidityAmount: any;
    token1OutputAmount: any;
    fee: any;
}): BigNumber;
export declare function calculateXYKToken1AmountFromToken0Amount({ token0LiquidityAmount: i, token1LiquidityAmount: e, token0OutputAmount: t, fee: n, }: {
    token0LiquidityAmount: any;
    token1LiquidityAmount: any;
    token0OutputAmount: any;
    fee: any;
}): BigNumber;
export declare function validateTradeSize(i: any, e: any): void;
