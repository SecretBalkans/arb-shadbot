"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShadeTokenBySymbol = exports.extractShadeTokenSymbol = exports.extractShadeTokenSymbolById = exports.getShadeTokenById = exports.toTokenId = void 0;
const dex_types_1 = require("../types/dex-types");
const lodash_1 = __importDefault(require("lodash"));
const utils_1 = require("../../utils");
const shade_api_utils_1 = require("./shade-api-utils");
const logger = new utils_1.Logger('ShadeTokens');
function toTokenId(shadeToken) {
    const symbol = shadeToken.symbol;
    // Hack: easy hack the shadeToken.symbol to match our internal SwapTokenMap
    const token = { SSCRT: dex_types_1.SwapTokenMap.SCRT }[symbol] || dex_types_1.SwapTokenMap[lodash_1.default.trimStart(symbol.replace('st', '_st$'), 'as').replace('-', '').replace('_st$', 'st')];
    if (!token) {
        logger.debugOnce(`Not mapped ShadeSwap symbol=${symbol}`);
    }
    else {
        return token;
    }
}
exports.toTokenId = toTokenId;
function getShadeTokenById(id) {
    const token = lodash_1.default.find(shade_api_utils_1.tokens, (shadeToken) => {
        return shadeToken.id === id
            &&
                // Check that it is used in the shade pairs
                !!lodash_1.default.find(shade_api_utils_1.pairs, (d) => [d.token_0, d.token_1].includes(id));
    });
    if (!token) {
        throw new Error(`No Shade token wih id=${id} found in token & pairs registry. Fix search probably`);
    }
    return token;
}
exports.getShadeTokenById = getShadeTokenById;
function getShadeTokenInfoById(id) {
    const token = lodash_1.default.find(shade_api_utils_1.tokens, (shadeToken) => {
        return shadeToken.id === id
            &&
                // Check that it is used in the shade pairs
                !!lodash_1.default.find(shade_api_utils_1.pairs, (d) => [d.token_0, d.token_1].includes(id));
    });
    if (!token) {
        throw new Error(`No Shade token wih id=${id} found in token & pairs registry. Fix search probably`);
    }
    return token;
}
// noinspection JSUnusedGlobalSymbols
function extractShadeTokenSymbolById(id) {
    const token = getShadeTokenInfoById(id);
    return extractShadeTokenSymbol(token);
}
exports.extractShadeTokenSymbolById = extractShadeTokenSymbolById;
function extractShadeTokenSymbol(shadeToken) {
    return lodash_1.default.trimStart(shadeToken.symbol.replace('stk', '_stk^').replace('st', '_st$'), 'as').replace('.axl', '').replace('-', '').replace('_st$', 'st').replace('_stk^', 'stk');
}
exports.extractShadeTokenSymbol = extractShadeTokenSymbol;
function getShadeTokenBySymbol(symbol) {
    const token = lodash_1.default.find(shade_api_utils_1.tokens, (shadeToken) => {
        return extractShadeTokenSymbol(shadeToken) === symbol
            &&
                // Check that it is used in the shade pairs
                !!lodash_1.default.find(shade_api_utils_1.pairs, (d) => [d.token_0, d.token_1].includes(shadeToken.id));
    });
    if (!token) {
        throw new Error(`No Shade token wih symbol=${symbol} found in token & pairs registry. Fix search probably`);
    }
    return token;
}
exports.getShadeTokenBySymbol = getShadeTokenBySymbol;
//# sourceMappingURL=tokens.js.map