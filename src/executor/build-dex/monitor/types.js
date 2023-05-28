"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRawArbV1BigNumber = exports.parseRawArbV1Number = exports.toRawArbV1 = exports.parseRoute = exports.serializeRoute = exports.isShadeTokenEssential = exports.isShadePathRaw = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const dex_types_1 = require("../dex/types/dex-types");
const lodash_1 = __importDefault(require("lodash"));
const shade_api_utils_1 = require("../dex/shade/shade-api-utils");
function isShadePathRaw(poolRaw) {
    return !poolRaw['@type'];
}
exports.isShadePathRaw = isShadePathRaw;
function isShadeTokenEssential(denomInfo) {
    return !denomInfo.denom;
}
exports.isShadeTokenEssential = isShadeTokenEssential;
function validateDenomInfo(t0) {
    if (!isShadeTokenEssential(t0) && !!t0.denom) {
        return t0;
    }
    throw new Error(`Expected osmosis DenomInfo type. Actual: ${JSON.stringify(t0)}.`);
}
function validateOsmoRaw(raw) {
    if (!isShadePathRaw(raw) && !isShadeTokenInfo(raw)) {
        return raw;
    }
    throw new Error(`Expected WeightedPoolRaw | StablePoolRaw. Actual: ${JSON.stringify(raw)}.`);
}
function isOsmosisRoute(route) {
    return !Array.isArray(route);
}
function isOsmosisSerializedRoute(route) {
    return !Array.isArray(route);
}
function serializeRoute(route) {
    if (isOsmosisRoute(route)) {
        return route;
    }
    else {
        return route.map(path => {
            return {
                t0: path.t0,
                t1: path.t1,
                raw: (0, shade_api_utils_1.toRawShadePool)(path.raw, path.t0.decimals, path.t1.decimals),
            };
        });
    }
}
exports.serializeRoute = serializeRoute;
function isShadeTokenInfo(raw) {
    return !!raw.contract;
}
function parseRoute(route) {
    if (isOsmosisSerializedRoute(route)) {
        return route;
    }
    else {
        return lodash_1.default.map(route, path => {
            return {
                t0: path.t0,
                t1: path.t1,
                raw: (0, shade_api_utils_1.parseRawPool)(path.raw, path.t0.decimals, path.t1.decimals),
            };
        });
    }
}
exports.parseRoute = parseRoute;
function toRawArbV1(json) {
    return {
        amount_bridge: json.amountBridge,
        amount_in: json.amountIn,
        amount_out: json.amountOut,
        bridge: json.bridge || '',
        dex_0: json.dex0,
        dex_1: json.dex1,
        id: json.id,
        reverse_id: json.reverseId,
        last_ts: json.lastTs,
        route_0: serializeRoute(json.route0),
        route_1: serializeRoute(json.route1),
        token_0: json.token0,
        token_1: json.token1,
        ts: json.ts,
    };
}
exports.toRawArbV1 = toRawArbV1;
function validateDexProtocol(str) {
    if ((0, dex_types_1.isDexProtocolName)(str)) {
        return str;
    }
    else {
        throw new Error(`Invalid dex protocol name ${str} from gql`);
    }
}
function validateSwapToken(token) {
    if ((0, dex_types_1.isSwapToken)(token)) {
        return token;
    }
    else {
        throw new Error(`Invalid token name ${token} from gql`);
    }
}
function parseRawArbV1Number(arb) {
    return {
        amountBridge: arb.amount_bridge,
        amountIn: arb.amount_in,
        amountOut: arb.amount_out,
        bridge: arb.bridge,
        dex0: validateDexProtocol(arb.dex_0),
        dex1: validateDexProtocol(arb.dex_1),
        id: arb.id,
        reverseId: arb.reverse_id,
        lastTs: new Date(arb.last_ts),
        route0: parseRoute(arb.route_0),
        route1: parseRoute(arb.route_1),
        token0: validateSwapToken(arb.token_0),
        token1: validateSwapToken(arb.token_1),
        ts: new Date(arb.ts),
    };
}
exports.parseRawArbV1Number = parseRawArbV1Number;
// noinspection JSUnusedGlobalSymbols - use by dexSDK
function parseRawArbV1BigNumber(arb) {
    return Object.assign(Object.assign({}, parseRawArbV1Number(arb)), { amountBridge: (0, bignumber_js_1.default)(arb.amount_bridge), amountIn: (0, bignumber_js_1.default)(arb.amount_in), amountOut: (0, bignumber_js_1.default)(arb.amount_out) });
}
exports.parseRawArbV1BigNumber = parseRawArbV1BigNumber;
//# sourceMappingURL=types.js.map