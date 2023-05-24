"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toRawShadePool = exports.parseRawPool = exports.getTokenDecimals = exports.useTokens = exports.getTokenPrices = exports.initShadeTokens = exports.getPairsRaw = exports.ShadePair = exports.pairs = exports.tokens = void 0;
const utils_1 = require("../../utils");
const https_1 = __importDefault(require("https"));
const lodash_1 = __importDefault(require("lodash"));
const bignumber_js_1 = __importDefault(require("bignumber.js"));
class ShadePair {
    constructor(token0, token1, lpTokenInfo, rawInfo, stakingContract) {
        this.token0 = token0;
        this.token1 = token1;
        this.lpTokenInfo = lpTokenInfo;
        this.rawInfo = rawInfo;
        this.stakingContract = stakingContract;
        this.name = lpTokenInfo.symbol;
    }
    get token0PoolPrice() {
        return this.token0.amount * this.token0.price;
    }
    get token1PoolPrice() {
        return this.token1.amount * this.token1.price;
    }
    get skew() {
        return this.skewSign * this.skewPercentage;
    }
    get skewSign() {
        const p0 = this.token0PoolPrice;
        const p1 = this.token1PoolPrice;
        return (Math.sign(p0 - p1) > 0 ? -1 : 1);
    }
    get skewPercentage() {
        const p0 = this.token0PoolPrice;
        const p1 = this.token1PoolPrice;
        return Math.abs(p0 - p1) / Math.min(p0, p1);
    }
}
exports.ShadePair = ShadePair;
const shadeApiHttpsAgent = new https_1.default.Agent({
    keepAlive: true,
    keepAliveMsecs: 3000,
    maxSockets: 5,
});
function getPairsRaw(cached = false) {
    return __awaiter(this, void 0, void 0, function* () {
        exports.pairs = cached || !exports.pairs ? yield (0, utils_1.fetchTimeout)('https://na36v10ce3.execute-api.us-east-1.amazonaws.com/API-mainnet-STAGE/shadeswap/pairs', {
            agent: shadeApiHttpsAgent,
        }, 10000) : exports.pairs;
        return exports.pairs;
    });
}
exports.getPairsRaw = getPairsRaw;
function initShadeTokens() {
    return __awaiter(this, void 0, void 0, function* () {
        exports.tokens = exports.tokens || (yield (0, utils_1.fetchTimeout)('https://na36v10ce3.execute-api.us-east-1.amazonaws.com/API-mainnet-STAGE/tokens', {
            agent: shadeApiHttpsAgent,
        }));
    });
}
exports.initShadeTokens = initShadeTokens;
function getTokenPrices() {
    return __awaiter(this, void 0, void 0, function* () {
        yield initShadeTokens();
        return (0, utils_1.fetchTimeout)('https://na36v10ce3.execute-api.us-east-1.amazonaws.com/API-mainnet-STAGE/token_prices', {
            agent: shadeApiHttpsAgent,
        }, 10000);
    });
}
exports.getTokenPrices = getTokenPrices;
const useTokens = () => ({
    getTokenDecimals
});
exports.useTokens = useTokens;
function getTokenDecimals(tokenId) {
    return lodash_1.default.find(exports.tokens, { id: tokenId }).decimals;
}
exports.getTokenDecimals = getTokenDecimals;
function parseRawPool(n, t0decimals, t1decimals) {
    var _a, _b, _c;
    const vol = n.volume ? {
        volume: n.volume.volume,
        volume24HourChange: n.volume.volume_24h_change,
        volume24HourChangePercent: n.volume.volume_24h_change_perc,
    } : {
        volume: 0,
        volume24HourChange: 0,
        volume24HourChangePercent: 0,
    };
    let stable;
    !!n.stable_params ? stable = {
        priceRatio: (0, bignumber_js_1.default)(n.stable_params.price_ratio),
        a: (0, bignumber_js_1.default)(n.stable_params.a),
        gamma1: (0, bignumber_js_1.default)(n.stable_params.gamma1),
        gamma2: (0, bignumber_js_1.default)(n.stable_params.gamma2),
        minTradeSizeToken0For1: (0, bignumber_js_1.default)(n.stable_params.min_trade_size_0_to_1),
        minTradeSizeToken1For0: (0, bignumber_js_1.default)(n.stable_params.min_trade_size_1_to_0),
        maxPriceImpactAllowed: (0, bignumber_js_1.default)(n.stable_params.max_price_impact_allowed),
    } : stable = null;
    const apy = (_b = (_a = n.apy) === null || _a === void 0 ? void 0 : _a.reward_tokens) === null || _b === void 0 ? void 0 : _b.map(rewardToken => ({
        tokenId: rewardToken.token_id,
        apy: rewardToken.apy,
    }));
    const e = {
        id: n.id,
        contract: {
            address: n.contract.address,
            codeHash: n.contract.code_hash,
        },
        token0Id: n.token_0,
        token0AmountRaw: n.token_0_amount,
        token1Id: n.token_1,
        token1AmountRaw: n.token_1_amount,
        lpTokenId: n.lp_token,
        stableParams: stable,
        fees: {
            dao: (0, bignumber_js_1.default)(n.fees.dao),
            liquidityProvider: (0, bignumber_js_1.default)(n.fees.lp),
        },
        stakingContract: n.staking_contract ? {
            id: n.staking_contract.id,
            address: n.staking_contract.address,
            codeHash: n.staking_contract.code_hash,
        } : null,
        rewardTokens: apy,
        flags: n.flags,
        metrics: {
            liquidityRaw: n.liquidity,
            volume: {
                value: Number(vol.volume),
                changeAmount: Number(vol.volume24HourChange),
                changePercent: Number(vol.volume24HourChangePercent),
            },
            apy: (_c = n.apy) === null || _c === void 0 ? void 0 : _c.total,
            currency: n.currency,
        },
    };
    const { id: o, contract: u, stakingContract: l, rewardTokens: k, lpTokenId: O, token0Id: v, token0AmountRaw: t0amnt, token1Id: d, token1AmountRaw: g, fees: m, stableParams: y, flags: b, metrics: C, } = e;
    return {
        id: o,
        contract: { address: u.address, codeHash: u.codeHash },
        token0Id: v,
        token0Amount: (0, utils_1.convertCoinFromUDenomV2)(t0amnt, t0decimals),
        token1Id: d,
        token1Amount: (0, utils_1.convertCoinFromUDenomV2)(g, t1decimals),
        lpTokenId: O,
        stableParams: y,
        fees: m,
        flags: b
    };
}
exports.parseRawPool = parseRawPool;
function toRawShadePool(parsedPool, t0Decimals, t1Decimals) {
    return {
        id: parsedPool.id,
        contract: {
            address: parsedPool.contract.address,
            code_hash: parsedPool.contract.codeHash,
        },
        token_0: parsedPool.token0Id,
        token_0_amount: (0, utils_1.convertCoinToUDenomV2)(parsedPool.token0Amount, t0Decimals).toFixed(0),
        token_1: parsedPool.token1Id,
        token_1_amount: (0, utils_1.convertCoinToUDenomV2)(parsedPool.token1Amount, t1Decimals).toFixed(0),
        lp_token: parsedPool.lpTokenId,
        stable_params: parsedPool.stableParams
            ? {
                a: parsedPool.stableParams.a.toString(),
                gamma1: parsedPool.stableParams.gamma1.toString(),
                gamma2: parsedPool.stableParams.gamma2.toString(),
                min_trade_size_0_to_1: parsedPool.stableParams.minTradeSizeToken0For1.toString(),
                min_trade_size_1_to_0: parsedPool.stableParams.minTradeSizeToken1For0.toString(),
                max_price_impact_allowed: parsedPool.stableParams.maxPriceImpactAllowed.toString(),
                price_ratio: parsedPool.stableParams.priceRatio.toString(),
            }
            : null,
        fees: {
            dao: parsedPool.fees.dao.toString(),
            lp: parsedPool.fees.liquidityProvider.toString(),
        },
        flags: parsedPool.flags,
    };
}
exports.toRawShadePool = toRawShadePool;
//# sourceMappingURL=shade-api-utils.js.map