"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* tslint:disable:one-variable-per-declaration no-shadowed-variable */
const shade_api_utils_1 = require("./shade-api-utils");
const utils_1 = require("../../utils");
const shade_calc_utils_1 = require("./shade-calc-utils");
const bignumber_js_1 = __importDefault(require("bignumber.js"));
class ShadeCalc {
    constructor(pairs) {
        this.routePairsById = pairs;
    }
    calculatePathQuotaByEnding({ endingTokenAmount: endingTokenAmount, endingTokenId: endingTokenId, path: path, }) {
        const { getTokenDecimals: getTokenDecimals } = (0, shade_api_utils_1.useTokens)(), { inputTokenId: sourceTokenId, quoteInputAmount: inputAmount, quoteShadeDaoFee: quoteShadeDaoFee, quoteLPFee: quoteLpFee, quotePriceImpact: priceImpact, hops: hopsButAlsoRouteUnclear, } = [...path].reverse().reduce((pathSegment, poolId) => {
            const { inputTokenId: inputTokenId, quoteInputAmount: quoteInputAmount, quoteShadeDaoFee: quoteShadeDaoFee, quotePriceImpact: quotePriceImpact, quoteLPFee: quoteLpFee, hops: numOfHops, } = pathSegment;
            let otherTokenAmount, priceImpact;
            const poolPairInfo = this.getPoolById(poolId);
            numOfHops.unshift(poolPairInfo);
            const token0Decimals = getTokenDecimals(poolPairInfo.token0Id), token1Decimals = getTokenDecimals(poolPairInfo.token1Id), token0AmountInDenom = poolPairInfo.token0Amount.multipliedBy(Math.pow(10, token0Decimals)), token1AmountInDenom = poolPairInfo.token1Amount.multipliedBy(Math.pow(10, token1Decimals)), inputTokenDecimals = getTokenDecimals(inputTokenId), inputAmount = quoteInputAmount.toString(), l = (0, utils_1.convertCoinFromUDenomV2)(inputAmount, inputTokenDecimals);
            let u;
            inputTokenId === poolPairInfo.token0Id ? u = poolPairInfo.token1Id : u = poolPairInfo.token0Id;
            const te = getTokenDecimals(u);
            if (this.isStablePool(poolId)) {
                if (inputTokenId === poolPairInfo.token1Id && poolPairInfo.stableParams !== null) {
                    const Z = {
                        outputToken1Amount: l,
                        poolToken0Amount: poolPairInfo.token0Amount,
                        poolToken1Amount: poolPairInfo.token1Amount,
                        priceRatio: poolPairInfo.stableParams.priceRatio,
                        a: poolPairInfo.stableParams.a,
                        gamma1: poolPairInfo.stableParams.gamma1,
                        gamma2: poolPairInfo.stableParams.gamma2,
                        liquidityProviderFee: poolPairInfo.fees.liquidityProvider,
                        daoFee: poolPairInfo.fees.dao,
                        minTradeSizeToken0For1: poolPairInfo.stableParams.minTradeSizeToken0For1,
                        minTradeSizeToken1For0: poolPairInfo.stableParams.minTradeSizeToken1For0,
                        priceImpactLimit: poolPairInfo.stableParams.maxPriceImpactAllowed,
                    }, startingInputTokenAmount = (0, shade_calc_utils_1.getTradeInputOfSimulateReverseToken0WithToken1Trade)(Z);
                    otherTokenAmount = (0, utils_1.convertCoinToUDenomV2)(startingInputTokenAmount, te);
                    const b = {
                        inputToken0Amount: startingInputTokenAmount,
                        poolToken0Amount: poolPairInfo.token0Amount,
                        poolToken1Amount: poolPairInfo.token1Amount,
                        priceRatio: poolPairInfo.stableParams.priceRatio,
                        a: poolPairInfo.stableParams.a,
                        gamma1: poolPairInfo.stableParams.gamma1,
                        gamma2: poolPairInfo.stableParams.gamma2,
                        liquidityProviderFee: poolPairInfo.fees.liquidityProvider,
                        daoFee: poolPairInfo.fees.dao,
                        minTradeSizeToken0For1: poolPairInfo.stableParams.minTradeSizeToken0For1,
                        minTradeSizeToken1For0: poolPairInfo.stableParams.minTradeSizeToken1For0,
                        priceImpactLimit: poolPairInfo.stableParams.maxPriceImpactAllowed,
                    };
                    priceImpact = (0, shade_calc_utils_1.calculateStableSwapPriceImpactInputToken0)(b);
                }
                else if (inputTokenId === poolPairInfo.token0Id && poolPairInfo.stableParams !== null) {
                    const Z = {
                        outputToken0Amount: l,
                        poolToken0Amount: poolPairInfo.token0Amount,
                        poolToken1Amount: poolPairInfo.token1Amount,
                        priceRatio: poolPairInfo.stableParams.priceRatio,
                        a: poolPairInfo.stableParams.a,
                        gamma1: poolPairInfo.stableParams.gamma1,
                        gamma2: poolPairInfo.stableParams.gamma2,
                        liquidityProviderFee: poolPairInfo.fees.liquidityProvider,
                        daoFee: poolPairInfo.fees.dao,
                        minTradeSizeToken0For1: poolPairInfo.stableParams.minTradeSizeToken0For1,
                        minTradeSizeToken1For0: poolPairInfo.stableParams.minTradeSizeToken1For0,
                        priceImpactLimit: poolPairInfo.stableParams.maxPriceImpactAllowed,
                    }, V = (0, shade_calc_utils_1.getTradeInputOfSimulateReverseToken1WithToken0Trade)(Z);
                    otherTokenAmount = (0, utils_1.convertCoinToUDenomV2)(V, te).toString();
                    const b = {
                        inputToken1Amount: V,
                        poolToken0Amount: poolPairInfo.token0Amount,
                        poolToken1Amount: poolPairInfo.token1Amount,
                        priceRatio: poolPairInfo.stableParams.priceRatio,
                        a: poolPairInfo.stableParams.a,
                        gamma1: poolPairInfo.stableParams.gamma1,
                        gamma2: poolPairInfo.stableParams.gamma2,
                        liquidityProviderFee: poolPairInfo.fees.liquidityProvider,
                        daoFee: poolPairInfo.fees.dao,
                        minTradeSizeToken0For1: poolPairInfo.stableParams.minTradeSizeToken0For1,
                        minTradeSizeToken1For0: poolPairInfo.stableParams.minTradeSizeToken1For0,
                        priceImpactLimit: poolPairInfo.stableParams.maxPriceImpactAllowed,
                    };
                    priceImpact = (0, shade_calc_utils_1.calculateStableSwapPriceImpactInputToken1)(b);
                }
                else {
                    throw Error('stableswap parameter error');
                }
            } // An XYK Pool
            else if (inputTokenId === poolPairInfo.token1Id) {
                otherTokenAmount = (0, shade_calc_utils_1.calculateXYKToken0AmountFromToken1Amount)({
                    token0LiquidityAmount: token0AmountInDenom,
                    token1LiquidityAmount: token1AmountInDenom,
                    token1OutputAmount: quoteInputAmount,
                    fee: poolPairInfo.fees.liquidityProvider.plus(poolPairInfo.fees.dao),
                }),
                    priceImpact = (0, shade_calc_utils_1.calculateXYKPriceImpactFromToken0Amount)({
                        token0LiquidityAmount: token0AmountInDenom,
                        token1LiquidityAmount: token1AmountInDenom,
                        token0InputAmount: otherTokenAmount,
                    });
            }
            else if (inputTokenId === poolPairInfo.token0Id)
                otherTokenAmount = (0, shade_calc_utils_1.calculateXYKToken1AmountFromToken0Amount)({
                    token0LiquidityAmount: token0AmountInDenom,
                    token1LiquidityAmount: token1AmountInDenom,
                    token0OutputAmount: quoteInputAmount,
                    fee: poolPairInfo.fees.liquidityProvider.plus(poolPairInfo.fees.dao),
                }),
                    priceImpact = (0, shade_calc_utils_1.calculateXYKPriceImpactFromToken1Amount)({
                        token0LiquidityAmount: token0AmountInDenom,
                        token1LiquidityAmount: token1AmountInDenom,
                        token1InputAmount: otherTokenAmount,
                    });
            else
                throw Error('constant product rule swap parameter error');
            return {
                inputTokenId: u,
                quoteInputAmount: otherTokenAmount,
                quoteShadeDaoFee: quoteShadeDaoFee.plus(poolPairInfo.fees.dao),
                quoteLPFee: quoteLpFee.plus(poolPairInfo.fees.liquidityProvider),
                quotePriceImpact: quotePriceImpact.plus(priceImpact),
                hops: numOfHops,
            };
        }, {
            inputTokenId: endingTokenId,
            quoteInputAmount: endingTokenAmount,
            quoteShadeDaoFee: (0, bignumber_js_1.default)(0),
            quoteLPFee: (0, bignumber_js_1.default)(0),
            quotePriceImpact: (0, bignumber_js_1.default)(0),
            hops: [],
        });
        return {
            inputAmount,
            quoteOutputAmount: endingTokenAmount,
            quoteShadeDaoFee,
            quoteLPFee: quoteLpFee,
            priceImpact,
            sourceTokenId,
            targetTokenId: endingTokenId,
            route: hopsButAlsoRouteUnclear,
        };
    }
    calculatePathOutcome({ startingTokenAmount: startingTokenAmount, startingTokenId: startingTokenId, path: path, }) {
        const g = (0, shade_api_utils_1.useTokens)(), { getTokenDecimals: getTokenDecimals } = g, pathReduceResult = path.reduce((pathSegment, poolId) => {
            var _a;
            const { outputTokenId: outputTokenId, quoteOutputAmount: quoteOutputAmount, quoteShadeDaoFee: re, quotePriceImpact: totalPriceImpact, quoteLPFee: totalLPFee, hops: ne, } = pathSegment;
            let otherTokenDenomAmount, priceImpact;
            const poolPairInfo = this.getPoolById(poolId);
            // , he = parseRawPool(poolPairInfo);
            ne.push(poolPairInfo);
            const token0Decimals = getTokenDecimals(poolPairInfo.token0Id), token1Decimals = getTokenDecimals(poolPairInfo.token1Id), token0AmountInDenom = poolPairInfo.token0Amount.multipliedBy(Math.pow(10, token0Decimals)), token1AmountInDenom = poolPairInfo.token1Amount.multipliedBy(Math.pow(10, token1Decimals)), outputTokenDecimals = getTokenDecimals(outputTokenId), outputAmountString = quoteOutputAmount.toString(), inputToken0Amount = (0, utils_1.convertCoinFromUDenomV2)(outputAmountString, outputTokenDecimals);
            let otherTokenId;
            outputTokenId === poolPairInfo.token0Id ? otherTokenId = poolPairInfo.token1Id : otherTokenId = poolPairInfo.token0Id;
            const otherTokenDecimals = getTokenDecimals(otherTokenId);
            if (this.isStablePool(poolId))
                if (outputTokenId === poolPairInfo.token0Id && poolPairInfo.stableParams !== null) {
                    const stablePoolParams = {
                        inputToken0Amount,
                        poolToken0Amount: poolPairInfo.token0Amount,
                        poolToken1Amount: poolPairInfo.token1Amount,
                        priceRatio: poolPairInfo.stableParams.priceRatio,
                        a: poolPairInfo.stableParams.a,
                        gamma1: poolPairInfo.stableParams.gamma1,
                        gamma2: poolPairInfo.stableParams.gamma2,
                        liquidityProviderFee: poolPairInfo.fees.liquidityProvider,
                        daoFee: poolPairInfo.fees.dao,
                        minTradeSizeToken0For1: poolPairInfo.stableParams.minTradeSizeToken0For1,
                        minTradeSizeToken1For0: poolPairInfo.stableParams.minTradeSizeToken1For0,
                        priceImpactLimit: poolPairInfo.stableParams.maxPriceImpactAllowed,
                    }, otherTokenAmount = (0, shade_calc_utils_1.stableSwapToken0ToToken1InPool)(stablePoolParams);
                    otherTokenDenomAmount = (0, utils_1.convertCoinToUDenomV2)(otherTokenAmount, otherTokenDecimals),
                        priceImpact = (0, shade_calc_utils_1.calculateStableSwapPriceImpactInputToken0)(stablePoolParams);
                }
                else if (outputTokenId === poolPairInfo.token1Id && poolPairInfo.stableParams !== null) {
                    const Z = {
                        inputToken1Amount: inputToken0Amount,
                        poolToken0Amount: poolPairInfo.token0Amount,
                        poolToken1Amount: poolPairInfo.token1Amount,
                        priceRatio: poolPairInfo.stableParams.priceRatio,
                        a: poolPairInfo.stableParams.a,
                        gamma1: poolPairInfo.stableParams.gamma1,
                        gamma2: poolPairInfo.stableParams.gamma2,
                        liquidityProviderFee: poolPairInfo.fees.liquidityProvider,
                        daoFee: poolPairInfo.fees.dao,
                        minTradeSizeToken0For1: poolPairInfo.stableParams.minTradeSizeToken0For1,
                        minTradeSizeToken1For0: poolPairInfo.stableParams.minTradeSizeToken1For0,
                        priceImpactLimit: poolPairInfo.stableParams.maxPriceImpactAllowed,
                    }, V = (0, shade_calc_utils_1.stableSwapToken1ToToken0InPool)(Z);
                    otherTokenDenomAmount = (0, utils_1.convertCoinToUDenomV2)(V, otherTokenDecimals),
                        priceImpact = (0, shade_calc_utils_1.calculateStableSwapPriceImpactInputToken1)(Z);
                }
                else {
                    throw Error('stableswap parameter error');
                }
            else if (outputTokenId === poolPairInfo.token0Id) {
                otherTokenDenomAmount = (0, shade_calc_utils_1.Fo)({
                    token0LiquidityAmount: token0AmountInDenom,
                    token1LiquidityAmount: token1AmountInDenom,
                    token0InputAmount: quoteOutputAmount,
                    fee: poolPairInfo.fees.liquidityProvider.plus(poolPairInfo.fees.dao),
                });
                priceImpact = (0, shade_calc_utils_1.calculateXYKPriceImpactFromToken0Amount)({
                    token0LiquidityAmount: token0AmountInDenom,
                    token1LiquidityAmount: token1AmountInDenom,
                    token0InputAmount: quoteOutputAmount,
                });
            }
            else if (outputTokenId === poolPairInfo.token1Id)
                otherTokenDenomAmount = (0, shade_calc_utils_1.Ro)({
                    token0LiquidityAmount: token0AmountInDenom,
                    token1LiquidityAmount: token1AmountInDenom,
                    token1InputAmount: quoteOutputAmount,
                    fee: poolPairInfo.fees.liquidityProvider.plus(poolPairInfo.fees.dao),
                }),
                    priceImpact = (0, shade_calc_utils_1.calculateXYKPriceImpactFromToken1Amount)({
                        token0LiquidityAmount: token0AmountInDenom,
                        token1LiquidityAmount: token1AmountInDenom,
                        token1InputAmount: quoteOutputAmount,
                    });
            else
                throw Error('constant product rule swap parameter error');
            try {
                (0, shade_calc_utils_1.validateTradeSize)(otherTokenDenomAmount, (0, bignumber_js_1.default)(0));
            }
            catch (e) {
                throw Error(`Invalid trade size ${e.message} at path=${poolId}. tradeSize=${otherTokenDenomAmount.toNumber()} ${!!poolPairInfo.stableParams ? `stable_params.price_ratio=${(_a = poolPairInfo.stableParams) === null || _a === void 0 ? void 0 : _a.priceRatio}` : ''}`);
            }
            return {
                outputTokenId: otherTokenId,
                quoteOutputAmount: otherTokenDenomAmount,
                quoteShadeDaoFee: re.plus(poolPairInfo.fees.dao),
                quoteLPFee: totalLPFee.plus(poolPairInfo.fees.liquidityProvider),
                quotePriceImpact: totalPriceImpact.plus(priceImpact),
                hops: ne,
            };
        }, {
            outputTokenId: startingTokenId,
            quoteOutputAmount: startingTokenAmount,
            quoteShadeDaoFee: (0, bignumber_js_1.default)(0),
            quoteLPFee: (0, bignumber_js_1.default)(0),
            quotePriceImpact: (0, bignumber_js_1.default)(0),
            hops: [],
        }), { outputTokenId: $, quoteOutputAmount: F, quoteShadeDaoFee: P, quoteLPFee: I, quotePriceImpact: d, hops: rt, } = pathReduceResult;
        return {
            inputAmount: startingTokenAmount,
            quoteOutputAmount: F,
            quoteShadeDaoFee: P,
            quoteLPFee: I,
            priceImpact: d,
            sourceTokenId: startingTokenId,
            targetTokenId: $,
            route: rt,
        };
    }
    getPoolById(poolId) {
        return this.routePairsById[poolId];
    }
    isStablePool(poolId) {
        return this.getPoolById(poolId).stableParams !== null;
    }
}
exports.default = ShadeCalc;
//# sourceMappingURL=shade-calc.js.map