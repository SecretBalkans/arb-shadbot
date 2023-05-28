"use strict";
// noinspection CommaExpressionJS
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeIBCMinimalDenom = exports.convertCoinFromUDenomV2 = exports.convertCoinToUDenomV2 = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const buffer_1 = require("buffer");
const crypto_1 = require("@cosmjs/crypto");
const convertCoinToUDenomV2 = (input, decimals) => {
    return typeof input === 'string' || typeof input === 'number' ?
        (0, bignumber_js_1.default)(input)
            .multipliedBy((0, bignumber_js_1.default)(10).pow(decimals)) :
        (0, bignumber_js_1.default)(input.toString()).multipliedBy((0, bignumber_js_1.default)(10).pow(decimals));
};
exports.convertCoinToUDenomV2 = convertCoinToUDenomV2;
const convertCoinFromUDenomV2 = (input, decimals) => (bignumber_js_1.default.config({
    DECIMAL_PLACES: 18
}), (0, bignumber_js_1.default)(input.toString()).dividedBy((0, bignumber_js_1.default)(10).pow(decimals)));
exports.convertCoinFromUDenomV2 = convertCoinFromUDenomV2;
function makeIBCMinimalDenom(sourceChannelId, coinMinimalDenom) {
    return ("ibc/" +
        buffer_1.Buffer.from((0, crypto_1.sha256)(buffer_1.Buffer.from(`transfer/${sourceChannelId}/${coinMinimalDenom}`)))
            .toString("hex")
            .toUpperCase());
}
exports.makeIBCMinimalDenom = makeIBCMinimalDenom;
//# sourceMappingURL=denoms.js.map