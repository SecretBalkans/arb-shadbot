"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedRoutes = void 0;
const unit_1 = require("@keplr-wallet/unit");
const math_1 = require("@osmosis-labs/math");
const errors_1 = require("./errors");
class OptimizedRoutes {
    constructor(pools, incentivizedPoolIds, stakeCurrencyMinDenom) {
        this.stakeCurrencyMinDenom = stakeCurrencyMinDenom;
        this.candidatePathsCache = new Map();
        this._pools = pools;
        this._incentivizedPoolIds = incentivizedPoolIds;
    }
    get pools() {
        return this._pools;
    }
    getCandidateRoutes(tokenInDenom, tokenOutDenom, maxHops = 4, maxRouteCount = 4) {
        if (this.pools.length === 0) {
            return [];
        }
        const cacheKey = `${tokenInDenom}/${tokenOutDenom}`;
        const cached = this.candidatePathsCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        if (maxRouteCount > 10)
            throw new Error("maxRouteCount should be less than 10");
        const poolsUsed = Array(this.pools.length).fill(false);
        const routes = [];
        const computeRoutes = (tokenInDenom, tokenOutDenom, currentRoute, currentTokenOuts, poolsUsed, _previousTokenOuts) => {
            if (currentRoute.length > maxHops)
                return;
            if (currentRoute.length > 0 &&
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                currentRoute[currentRoute.length - 1].hasPoolAsset(tokenOutDenom)) {
                const foundRoute = {
                    pools: [...currentRoute],
                    tokenOutDenoms: [...currentTokenOuts, tokenOutDenom],
                    tokenInDenom,
                };
                routes.push(foundRoute);
                return;
            }
            if (routes.length > maxRouteCount) {
                // only find top routes by iterating all pools by high liquidity first
                return;
            }
            for (let i = 0; i < this.pools.length; i++) {
                if (poolsUsed[i]) {
                    continue; // skip pool
                }
                const previousTokenOuts = _previousTokenOuts
                    ? _previousTokenOuts
                    : [tokenInDenom]; // imaginary prev pool
                const curPool = this.pools[i];
                let prevPoolCurPoolTokenMatch;
                curPool.poolAssets.forEach(({ denom }) => previousTokenOuts.forEach((d) => {
                    if (d === denom) {
                        prevPoolCurPoolTokenMatch = denom;
                    }
                }));
                if (!prevPoolCurPoolTokenMatch) {
                    continue; // skip pool
                }
                currentRoute.push(curPool);
                if (currentRoute.length > 1 &&
                    prevPoolCurPoolTokenMatch !== tokenInDenom &&
                    prevPoolCurPoolTokenMatch !== tokenOutDenom) {
                    currentTokenOuts.push(prevPoolCurPoolTokenMatch);
                }
                poolsUsed[i] = true;
                computeRoutes(tokenInDenom, tokenOutDenom, currentRoute, currentTokenOuts, poolsUsed, curPool.poolAssets
                    .filter(({ denom }) => denom !== prevPoolCurPoolTokenMatch)
                    .map(({ denom }) => denom));
                poolsUsed[i] = false;
                currentTokenOuts.pop();
                currentRoute.pop();
            }
        };
        computeRoutes(tokenInDenom, tokenOutDenom, [], [], poolsUsed);
        this.candidatePathsCache.set(cacheKey, routes);
        return routes.filter(({ pools }) => pools.length <= maxHops);
    }
    getOptimizedRoutesByTokenIn(tokenIn, tokenOutDenom, maxPools, maxRoutes = 3) {
        if (!tokenIn.amount.isPositive()) {
            throw new Error("Token in amount is zero or negative");
        }
        let routes = this.getCandidateRoutes(tokenIn.denom, tokenOutDenom, maxPools, maxRoutes / 2);
        // find routes with swapped in/out tokens since getCandidateRoutes is a greedy algorithm
        const reverseRoutes = this.getCandidateRoutes(tokenOutDenom, tokenIn.denom, maxPools, maxRoutes / 2);
        const invertedRoutes = [];
        reverseRoutes.forEach((route) => {
            invertedRoutes.push({
                pools: [...route.pools].reverse(),
                tokenOutDenoms: [
                    route.tokenInDenom,
                    ...route.tokenOutDenoms.slice(0, -1),
                ].reverse(),
                tokenInDenom: route.tokenOutDenoms[route.tokenOutDenoms.length - 1],
            });
        });
        routes = [...routes, ...invertedRoutes];
        // Updated: Filter out invalid routes - keep those with tokensOut.length === pools.length to avoid error later (!?)
        routes = routes.filter(r => r.pools.length === r.tokenOutDenoms.length);
        // find best routes --
        // prioritize shorter routes
        routes = routes.sort((path1, path2) => {
            return path1.pools.length < path2.pools.length ? -1 : 1;
        });
        // Priority is given to direct swap.
        // For direct swap, sort by normalized liquidity.
        // In case of multihop swap, sort by first normalized liquidity.
        routes = routes.sort((path1, path2) => {
            const path1IsDirect = path1.pools.length === 1;
            const path2IsDirect = path2.pools.length === 1;
            if (!path1IsDirect || !path2IsDirect) {
                return path1IsDirect ? -1 : 1;
            }
            const path1NormalizedLiquidity = path1.pools[0].getNormalizedLiquidity(tokenIn.denom, path1.tokenOutDenoms[0]);
            const path2NormalizedLiquidity = path2.pools[0].getNormalizedLiquidity(tokenIn.denom, path2.tokenOutDenoms[0]);
            return path1NormalizedLiquidity.gte(path2NormalizedLiquidity) ? -1 : 1;
        });
        // TODO: if paths is single pool - confirm enough liquidity otherwise find different route
        if (routes.length === 0) {
            throw new errors_1.NoPoolsError();
        }
        const initialSwapAmounts = [];
        let totalLimitAmount = new unit_1.Int(0);
        for (const route of routes) {
            const limitAmount = route.pools[0].getLimitAmountByTokenIn(tokenIn.denom);
            totalLimitAmount = totalLimitAmount.add(limitAmount);
            if (totalLimitAmount.lt(tokenIn.amount)) {
                initialSwapAmounts.push(limitAmount);
            }
            else {
                let sumInitialSwapAmounts = new unit_1.Int(0);
                for (const initialSwapAmount of initialSwapAmounts) {
                    sumInitialSwapAmounts = sumInitialSwapAmounts.add(initialSwapAmount);
                }
                const diff = tokenIn.amount.sub(sumInitialSwapAmounts);
                initialSwapAmounts.push(diff);
                break;
            }
        }
        // No enough liquidity
        if (totalLimitAmount.lt(tokenIn.amount)) {
            throw new errors_1.NotEnoughLiquidityError();
        }
        return initialSwapAmounts.map((amount, i) => {
            return Object.assign(Object.assign({}, routes[i]), { amount });
        });
    }
    calculateTokenOutByTokenIn(routes) {
        if (routes.length === 0) {
            throw new Error("Paths are empty");
        }
        let totalOutAmount = new unit_1.Int(0);
        let totalBeforeSpotPriceInOverOut = new unit_1.Dec(0);
        let totalAfterSpotPriceInOverOut = new unit_1.Dec(0);
        let totalEffectivePriceInOverOut = new unit_1.Dec(0);
        let totalSwapFee = new unit_1.Dec(0);
        /** Special case when routing through _only_ 2 OSMO pools. */
        let isMultihopOsmoFeeDiscount = false;
        let sumAmount = new unit_1.Int(0);
        for (const path of routes) {
            sumAmount = sumAmount.add(path.amount);
        }
        let outDenom;
        for (const route of routes) {
            if (route.pools.length !== route.tokenOutDenoms.length) {
                throw new Error(`Invalid path: pools and tokenOutDenoms length mismatch, IDs:${route.pools.map((p) => p.id)} ${route.pools
                    .flatMap((p) => p.poolAssets.map((pa) => pa.denom))
                    .join(",")} !== ${route.tokenOutDenoms.join(",")}`);
            }
            if (route.pools.length === 0) {
                throw new Error("Invalid path: pools length is 0");
            }
            if (!outDenom) {
                outDenom = route.tokenOutDenoms[route.tokenOutDenoms.length - 1];
            }
            else if (outDenom !== route.tokenOutDenoms[route.tokenOutDenoms.length - 1]) {
                throw new Error("Paths have different out denom");
            }
            const amountFraction = route.amount
                .toDec()
                .quoTruncate(sumAmount.toDec());
            let previousInDenom = route.tokenInDenom;
            let previousInAmount = route.amount;
            let beforeSpotPriceInOverOut = new unit_1.Dec(1);
            let afterSpotPriceInOverOut = new unit_1.Dec(1);
            let effectivePriceInOverOut = new unit_1.Dec(1);
            let swapFee = new unit_1.Dec(0);
            for (let i = 0; i < route.pools.length; i++) {
                const pool = route.pools[i];
                const outDenom = route.tokenOutDenoms[i];
                let poolSwapFee = pool.swapFee;
                if (routes.length === 1 &&
                    (0, math_1.isOsmoRoutedMultihop)(routes[0].pools.map((routePool) => ({
                        id: routePool.id,
                        isIncentivized: this._incentivizedPoolIds.includes(routePool.id),
                    })), route.tokenOutDenoms[0], this.stakeCurrencyMinDenom)) {
                    isMultihopOsmoFeeDiscount = true;
                    const { maxSwapFee, swapFeeSum } = (0, math_1.getOsmoRoutedMultihopTotalSwapFee)(routes[0].pools);
                    poolSwapFee = maxSwapFee.mul(poolSwapFee.quo(swapFeeSum));
                }
                // less fee
                const tokenOut = pool.getTokenOutByTokenIn({ denom: previousInDenom, amount: previousInAmount }, outDenom, poolSwapFee);
                if (!tokenOut.amount.gt(new unit_1.Int(0))) {
                    // not enough liquidity
                    console.warn("Token out is 0 through pool:", pool.id);
                    return Object.assign(Object.assign({}, tokenOut), { tokenInFeeAmount: new unit_1.Int(0), swapFee, multiHopOsmoDiscount: false });
                }
                beforeSpotPriceInOverOut = beforeSpotPriceInOverOut.mulTruncate(tokenOut.beforeSpotPriceInOverOut);
                afterSpotPriceInOverOut = afterSpotPriceInOverOut.mulTruncate(tokenOut.afterSpotPriceInOverOut);
                effectivePriceInOverOut = effectivePriceInOverOut.mulTruncate(tokenOut.effectivePriceInOverOut);
                swapFee = swapFee.add(new unit_1.Dec(1).sub(swapFee).mulTruncate(poolSwapFee));
                // is last pool
                if (i === route.pools.length - 1) {
                    totalOutAmount = totalOutAmount.add(tokenOut.amount);
                    totalBeforeSpotPriceInOverOut = totalBeforeSpotPriceInOverOut.add(beforeSpotPriceInOverOut.mulTruncate(amountFraction));
                    totalAfterSpotPriceInOverOut = totalAfterSpotPriceInOverOut.add(afterSpotPriceInOverOut.mulTruncate(amountFraction));
                    totalEffectivePriceInOverOut = totalEffectivePriceInOverOut.add(effectivePriceInOverOut.mulTruncate(amountFraction));
                    totalSwapFee = totalSwapFee.add(swapFee.mulTruncate(amountFraction));
                }
                else {
                    previousInDenom = outDenom;
                    previousInAmount = tokenOut.amount;
                }
            }
        }
        const priceImpact = totalEffectivePriceInOverOut
            .quo(totalBeforeSpotPriceInOverOut)
            .sub(new unit_1.Dec("1"));
        return {
            amount: totalOutAmount,
            beforeSpotPriceInOverOut: totalBeforeSpotPriceInOverOut,
            beforeSpotPriceOutOverIn: new unit_1.Dec(1).quoTruncate(totalBeforeSpotPriceInOverOut),
            afterSpotPriceInOverOut: totalAfterSpotPriceInOverOut,
            afterSpotPriceOutOverIn: new unit_1.Dec(1).quoTruncate(totalAfterSpotPriceInOverOut),
            effectivePriceInOverOut: totalEffectivePriceInOverOut,
            effectivePriceOutOverIn: new unit_1.Dec(1).quoTruncate(totalEffectivePriceInOverOut),
            tokenInFeeAmount: sumAmount.sub(new unit_1.Dec(sumAmount).mulTruncate(new unit_1.Dec(1).sub(totalSwapFee)).round()),
            swapFee: totalSwapFee,
            multiHopOsmoDiscount: isMultihopOsmoFeeDiscount,
            priceImpact,
        };
    }
}
exports.OptimizedRoutes = OptimizedRoutes;
//# sourceMappingURL=routes.js.map