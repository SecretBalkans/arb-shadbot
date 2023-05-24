"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeightedPool = void 0;
const unit_1 = require("@keplr-wallet/unit");
const math_1 = require("@osmosis-labs/math");
/** Implementation of Pool interface w/ related weighted/balancer calculations & metadata. */
class WeightedPool {
    constructor(raw) {
        this.raw = raw;
    }
    get type() {
        return "weighted";
    }
    get id() {
        return this.raw.id;
    }
    get totalWeight() {
        return new unit_1.Int(this.raw.total_weight);
    }
    get poolAssets() {
        return this.raw.pool_assets.map((asset) => {
            return {
                denom: asset.token.denom,
                amount: new unit_1.Int(asset.token.amount),
                weight: new unit_1.Int(asset.weight),
            };
        });
    }
    get poolAssetDenoms() {
        return this.raw.pool_assets.map((asset) => asset.token.denom);
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
    /** LBP pool */
    get smoothWeightChange() {
        if (this.raw.pool_params.smooth_weight_change_params !== null) {
            const { start_time, duration, initial_pool_weights, target_pool_weights, } = this.raw.pool_params.smooth_weight_change_params;
            return {
                startTime: start_time,
                duration,
                initialPoolWeights: initial_pool_weights,
                targetPoolWeights: target_pool_weights,
            };
        }
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
        return math_1.WeightedPoolMath.calcSpotPrice(new unit_1.Dec(inPoolAsset.amount), new unit_1.Dec(inPoolAsset.weight), new unit_1.Dec(outPoolAsset.amount), new unit_1.Dec(outPoolAsset.weight), this.swapFee);
    }
    getSpotPriceInOverOutWithoutSwapFee(tokenInDenom, tokenOutDenom) {
        const inPoolAsset = this.getPoolAsset(tokenInDenom);
        const outPoolAsset = this.getPoolAsset(tokenOutDenom);
        return math_1.WeightedPoolMath.calcSpotPrice(new unit_1.Dec(inPoolAsset.amount), new unit_1.Dec(inPoolAsset.weight), new unit_1.Dec(outPoolAsset.amount), new unit_1.Dec(outPoolAsset.weight), new unit_1.Dec(0));
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
        const beforeSpotPriceInOverOut = math_1.WeightedPoolMath.calcSpotPrice(new unit_1.Dec(inPoolAsset.amount), new unit_1.Dec(inPoolAsset.weight), new unit_1.Dec(outPoolAsset.amount), new unit_1.Dec(outPoolAsset.weight), swapFee !== null && swapFee !== void 0 ? swapFee : this.swapFee);
        const tokenInAmount = math_1.WeightedPoolMath.calcInGivenOut(new unit_1.Dec(inPoolAsset.amount), new unit_1.Dec(inPoolAsset.weight), new unit_1.Dec(outPoolAsset.amount), new unit_1.Dec(outPoolAsset.weight), new unit_1.Dec(tokenOut.amount), swapFee !== null && swapFee !== void 0 ? swapFee : this.swapFee).truncate();
        const afterSpotPriceInOverOut = math_1.WeightedPoolMath.calcSpotPrice(new unit_1.Dec(inPoolAsset.amount).add(new unit_1.Dec(tokenInAmount)), new unit_1.Dec(inPoolAsset.weight), new unit_1.Dec(outPoolAsset.amount).sub(new unit_1.Dec(tokenOut.amount)), new unit_1.Dec(outPoolAsset.weight), swapFee !== null && swapFee !== void 0 ? swapFee : this.swapFee);
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
        const beforeSpotPriceInOverOut = math_1.WeightedPoolMath.calcSpotPrice(new unit_1.Dec(inPoolAsset.amount), new unit_1.Dec(inPoolAsset.weight), new unit_1.Dec(outPoolAsset.amount), new unit_1.Dec(outPoolAsset.weight), swapFee !== null && swapFee !== void 0 ? swapFee : this.swapFee);
        const tokenOutAmount = math_1.WeightedPoolMath.calcOutGivenIn(new unit_1.Dec(inPoolAsset.amount), new unit_1.Dec(inPoolAsset.weight), new unit_1.Dec(outPoolAsset.amount), new unit_1.Dec(outPoolAsset.weight), new unit_1.Dec(tokenIn.amount), swapFee !== null && swapFee !== void 0 ? swapFee : this.swapFee).truncate();
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
        const afterSpotPriceInOverOut = math_1.WeightedPoolMath.calcSpotPrice(new unit_1.Dec(inPoolAsset.amount).add(new unit_1.Dec(tokenIn.amount)), new unit_1.Dec(inPoolAsset.weight), new unit_1.Dec(outPoolAsset.amount).sub(new unit_1.Dec(tokenOutAmount)), new unit_1.Dec(outPoolAsset.weight), swapFee !== null && swapFee !== void 0 ? swapFee : this.swapFee);
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
        const tokenIn = this.getPoolAsset(tokenInDenom);
        const tokenOut = this.getPoolAsset(tokenOutDenom);
        return tokenOut.amount
            .toDec()
            .mul(tokenIn.weight.toDec())
            .quo(tokenIn.weight.toDec().add(tokenOut.weight.toDec()));
    }
    getLimitAmountByTokenIn(denom) {
        return this.getPoolAsset(denom)
            .amount.toDec()
            .mul(new unit_1.Dec("0.3"))
            .truncate();
    }
}
exports.WeightedPool = WeightedPool;
//# sourceMappingURL=weighted.js.map