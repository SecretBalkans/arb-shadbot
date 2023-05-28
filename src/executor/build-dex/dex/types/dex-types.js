"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DexProtocol = exports.isDexProtocolName = exports.SwapTokenMap = exports.isSwapToken = exports.SwapToken = exports.reversePair = void 0;
function reversePair(pair) {
    return [pair[1], pair[0]];
}
exports.reversePair = reversePair;
var SwapToken;
(function (SwapToken) {
    SwapToken["SHD"] = "SHD";
    SwapToken["USDC"] = "USDC";
    SwapToken["USDT"] = "USDT";
    SwapToken["CMST"] = "CMST";
    SwapToken["SILK"] = "SILK";
    SwapToken["stkdSCRT"] = "stkdSCRT";
    SwapToken["stkATOM"] = "stkATOM";
    SwapToken["SCRT"] = "SCRT";
    SwapToken["stATOM"] = "stATOM";
    SwapToken["IST"] = "IST";
    SwapToken["ATOM"] = "ATOM";
    SwapToken["qATOM"] = "qATOM";
    SwapToken["stOSMO"] = "stOSMO";
    SwapToken["stINJ"] = "stINJ";
    SwapToken["INJ"] = "INJ";
    SwapToken["OSMO"] = "OSMO";
    SwapToken["JUNO"] = "JUNO";
    SwapToken["stJUNO"] = "stJUNO";
    SwapToken["BLD"] = "BLD";
})(SwapToken = exports.SwapToken || (exports.SwapToken = {}));
// noinspection JSUnusedLocalSymbols
function isSwapToken(token) {
    return !!exports.SwapTokenMap[token];
}
exports.isSwapToken = isSwapToken;
exports.SwapTokenMap = {
    SHD: SwapToken.SHD,
    SILK: SwapToken.SILK,
    CMST: SwapToken.CMST,
    stkdSCRT: SwapToken.stkdSCRT,
    SCRT: SwapToken.SCRT,
    stATOM: SwapToken.stATOM,
    qATOM: SwapToken.qATOM,
    IST: SwapToken.IST,
    ATOM: SwapToken.ATOM,
    stOSMO: SwapToken.stOSMO,
    USDT: SwapToken.USDT,
    USDC: SwapToken.USDC,
    OSMO: SwapToken.OSMO,
    JUNO: SwapToken.JUNO,
    stJUNO: SwapToken.stJUNO,
    BLD: SwapToken.BLD,
    INJ: SwapToken.INJ,
    stINJ: SwapToken.stINJ,
    stkATOM: SwapToken.stkATOM,
};
function isDexProtocolName(dexName) {
    return ['osmosis', 'shade'].includes(dexName);
}
exports.isDexProtocolName = isDexProtocolName;
class DexProtocol {
    calcSwap(amountIn, [tokenInId, tokenOutId], pools) {
        try {
            const result = this.calcSwapWithPools(amountIn, tokenInId, tokenOutId, pools);
            if (!result) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('No swap route');
            }
            return Object.assign({ internalSwapError: null }, result);
        }
        catch (err) {
            return {
                internalSwapError: new Error(`SwapError ${amountIn === null || amountIn === void 0 ? void 0 : amountIn.toString()} ${tokenInId} > ${tokenOutId} : ${err.message}\n\r${err.stack}`),
            };
        }
    }
}
exports.DexProtocol = DexProtocol;
//# sourceMappingURL=dex-types.js.map