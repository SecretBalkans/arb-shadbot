"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StablePool = void 0;
const unit_1 = require("@keplr-wallet/unit");
const math_1 = require("@osmosis-labs/math");
/** Implementation of stableswap Pool interface w/ related stableswap calculations & metadata. */
class StablePool {
    constructor(raw) {
        this.raw = raw;
    }
    get type() {
        return "stable";
    }
    get id() {
        return this.raw.id;
    }
    get poolAssets() {
        return this.raw.pool_liquidity.map((asset, index) => {
            // tslint:disable-next-line:radix
            const scalingFactor = parseInt(this.raw.scaling_factors[index]);
            if (isNaN(scalingFactor))
                throw new Error(`Invalid scaling factor in pool id: ${this.raw.id}`);
            return {
                denom: asset.denom,
                amount: new unit_1.Int(asset.amount),
                scalingFactor,
            };
        });
    }
    get poolAssetDenoms() {
        return this.raw.pool_liquidity.map((asset) => asset.denom);
    }
    get totalShare() {
        return new unit_1.Int(this.raw.total_shares.amount);
    }
    get shareDenom() {
        return this.raw.total_shares.denom;
    }
    get swapFee() {
        return new unit_1.Dec(this.raw.pool_params.swap_fee);
    }
    get exitFee() {
        return new unit_1.Dec(this.raw.pool_params.exit_fee);
    }
    get stableSwapTokens() {
        return this.poolAssets.map((asset, index) => {
            const scalingFactor = parseInt(this.raw.scaling_factors[index]);
            if (isNaN(scalingFactor))
                throw new Error("Invalid scaling factor");
            return {
                denom: asset.denom,
                amount: new unit_1.Dec(asset.amount.toString()),
                scalingFactor,
            };
        });
    }
    getPoolAsset(denom) {
        const poolAsset = this.poolAssets.find((asset) => asset.denom === denom);
        if (!poolAsset) {
            throw new Error(`Pool ${this.id} doesn't have the pool asset for ${denom}`);
        }
        return poolAsset;
    }
    hasPoolAsset(denom) {
        const poolAsset = this.poolAssets.find((asset) => asset.denom === denom);
        return poolAsset !== undefined;
    }
    getSpotPriceInOverOut(tokenInDenom, tokenOutDenom) {
        const inPoolAsset = this.getPoolAsset(tokenInDenom);
        const outPoolAsset = this.getPoolAsset(tokenOutDenom);
        return math_1.StableSwapMath.calcSpotPrice(this.stableSwapTokens, inPoolAsset.denom, outPoolAsset.denom);
    }
    getSpotPriceInOverOutWithoutSwapFee(tokenInDenom, tokenOutDenom) {
        const inPoolAsset = this.getPoolAsset(tokenInDenom);
        const outPoolAsset = this.getPoolAsset(tokenOutDenom);
        return math_1.StableSwapMath.calcSpotPrice(this.stableSwapTokens, inPoolAsset.denom, outPoolAsset.denom);
    }
    getSpotPriceOutOverIn(tokenInDenom, tokenOutDenom) {
        return new unit_1.Dec(1).quoTruncate(this.getSpotPriceInOverOut(tokenInDenom, tokenOutDenom));
    }
    getSpotPriceOutOverInWithoutSwapFee(tokenInDenom, tokenOutDenom) {
        return new unit_1.Dec(1).quoTruncate(this.getSpotPriceInOverOutWithoutSwapFee(tokenInDenom, tokenOutDenom));
    }
    getTokenInByTokenOut(tokenOut, tokenInDenom, swapFee) {
        tokenOut.amount = new unit_1.Int(tokenOut.amount.toString());
        const inPoolAsset = this.getPoolAsset(tokenInDenom);
        const outPoolAsset = this.getPoolAsset(tokenOut.denom);
        const coinOut = new unit_1.Coin(tokenOut.denom, tokenOut.amount);
        const beforeSpotPriceInOverOut = math_1.StableSwapMath.calcSpotPrice(this.stableSwapTokens, inPoolAsset.denom, outPoolAsset.denom);
        const tokenInAmount = math_1.StableSwapMath.calcInGivenOut(this.stableSwapTokens, coinOut, tokenInDenom, swapFee !== null && swapFee !== void 0 ? swapFee : this.swapFee);
        const movedStableTokens = this.stableSwapTokens.map((token) => {
            if (token.denom === tokenInDenom) {
                return Object.assign(Object.assign({}, token), { amount: token.amount.add(new unit_1.Dec(tokenInAmount)) });
            }
            if (token.denom === tokenOut.denom) {
                return Object.assign(Object.assign({}, token), { amount: token.amount.sub(new unit_1.Dec(tokenOut.amount)) });
            }
            return token;
        });
        const afterSpotPriceInOverOut = math_1.StableSwapMath.calcSpotPrice(movedStableTokens, inPoolAsset.denom, outPoolAsset.denom);
        if (afterSpotPriceInOverOut.lt(beforeSpotPriceInOverOut)) {
            throw new Error("Spot price can't be decreased after swap");
        }
        const effectivePrice = new unit_1.Dec(tokenInAmount).quo(new unit_1.Dec(tokenOut.amount));
        const priceImpact = effectivePrice
            .quo(beforeSpotPriceInOverOut)
            .sub(new unit_1.Dec("1"));
        return {
            amount: tokenInAmount,
            beforeSpotPriceInOverOut,
            beforeSpotPriceOutOverIn: new unit_1.Dec(1).quoTruncate(beforeSpotPriceInOverOut),
            afterSpotPriceInOverOut,
            afterSpotPriceOutOverIn: new unit_1.Dec(1).quoTruncate(afterSpotPriceInOverOut),
            effectivePriceInOverOut: effectivePrice,
            effectivePriceOutOverIn: new unit_1.Dec(1).quoTruncate(effectivePrice),
            priceImpact,
        };
    }
    getTokenOutByTokenIn(tokenIn, tokenOutDenom, swapFee) {
        tokenIn.amount = new unit_1.Int(tokenIn.amount.toString());
        const inPoolAsset = this.getPoolAsset(tokenIn.denom);
        const outPoolAsset = this.getPoolAsset(tokenOutDenom);
        const coinIn = new unit_1.Coin(tokenIn.denom, tokenIn.amount);
        const beforeSpotPriceInOverOut = math_1.StableSwapMath.calcSpotPrice(this.stableSwapTokens, inPoolAsset.denom, outPoolAsset.denom);
        const tokenOutAmount = math_1.StableSwapMath.calcOutGivenIn(this.stableSwapTokens, coinIn, outPoolAsset.denom, swapFee !== null && swapFee !== void 0 ? swapFee : this.swapFee);
        if (tokenOutAmount.equals(new unit_1.Int(0))) {
            return {
                amount: new unit_1.Int(0),
                beforeSpotPriceInOverOut: new unit_1.Dec(0),
                beforeSpotPriceOutOverIn: new unit_1.Dec(0),
                afterSpotPriceInOverOut: new unit_1.Dec(0),
                afterSpotPriceOutOverIn: new unit_1.Dec(0),
                effectivePriceInOverOut: new unit_1.Dec(0),
                effectivePriceOutOverIn: new unit_1.Dec(0),
                priceImpact: new unit_1.Dec(0),
            };
        }
        const movedStableTokens = this.stableSwapTokens.map((token) => {
            if (token.denom === tokenIn.denom) {
                return Object.assign(Object.assign({}, token), { amount: token.amount.add(new unit_1.Dec(tokenIn.amount)) });
            }
            if (token.denom === tokenOutDenom) {
                return Object.assign(Object.assign({}, token), { amount: token.amount.sub(new unit_1.Dec(tokenOutAmount)) });
            }
            return token;
        });
        const afterSpotPriceInOverOut = math_1.StableSwapMath.calcSpotPrice(movedStableTokens, tokenIn.denom, outPoolAsset.denom);
        if (afterSpotPriceInOverOut.lt(beforeSpotPriceInOverOut)) {
            throw new Error("Spot price can't be decreased after swap");
        }
        const effectivePrice = new unit_1.Dec(tokenIn.amount).quo(new unit_1.Dec(tokenOutAmount));
        const priceImpact = effectivePrice
            .quo(beforeSpotPriceInOverOut)
            .sub(new unit_1.Dec("1"));
        return {
            amount: tokenOutAmount,
            beforeSpotPriceInOverOut,
            beforeSpotPriceOutOverIn: new unit_1.Dec(1).quoTruncate(beforeSpotPriceInOverOut),
            afterSpotPriceInOverOut,
            afterSpotPriceOutOverIn: new unit_1.Dec(1).quoTruncate(afterSpotPriceInOverOut),
            effectivePriceInOverOut: effectivePrice,
            effectivePriceOutOverIn: new unit_1.Dec(1).quoTruncate(effectivePrice),
            priceImpact,
        };
    }
    getNormalizedLiquidity(tokenInDenom, tokenOutDenom) {
        const tokenOut = this.getPoolAsset(tokenOutDenom);
        const tokenIn = this.getPoolAsset(tokenInDenom);
        return tokenOut.amount
            .toDec()
            .mul(new unit_1.Dec(tokenIn.scalingFactor))
            .quo(new unit_1.Dec(tokenIn.scalingFactor).add(new unit_1.Dec(tokenOut.scalingFactor))); // TODO: ensure this works in router
    }
    getLimitAmountByTokenIn(denom) {
        return this.getPoolAsset(denom)
            .amount.toDec()
            .mul(new unit_1.Dec("0.3"))
            .truncate();
    }
}
exports.StablePool = StablePool;
//# sourceMappingURL=stable.js.map