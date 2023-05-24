"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = {
      enumerable: true, get: function () {
        return m[k];
      }
    };
  }
  Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
  Object.defineProperty(o, "default", {enumerable: true, value: v});
}) : function (o, v) {
  o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
  __setModuleDefault(result, mod);
  return result;
};
var __exportStar = (this && this.__exportStar) || function (m, exports) {
  for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
  return (mod && mod.__esModule) ? mod : {"default": mod};
};
Object.defineProperty(exports, "__esModule", {value: true});
const utils_1 = require("../utils");
const osmosis_calc_1 = __importStar(require("../dex/osmosis/osmosis-calc"));
const big_integer_1 = __importDefault(require("big-integer"));
const shade_calc_1 = __importDefault(require("../dex/shade/shade-calc"));
const lodash_1 = __importDefault(require("lodash"));
const src_1 = require("../lib/@osmosis/packages/pools/src");
__exportStar(require("../arbitrage/types"), exports);
__exportStar(require("../dex/types/dex-types"), exports);
__exportStar(require("../monitor/types"), exports);
__exportStar(require("../dex/shade/tokens"), exports);

function calculateTokenSwap(dex, swapTokenSent, swapTokenReceived, route, amount) {
  var _a;
  switch (dex) {
    case "osmosis":
      const osmosisRoute = route;
      const calc = new osmosis_calc_1.default(osmosisRoute.raws.map((poolRaw) => {
        if ((0, osmosis_calc_1.isStablePool)(poolRaw)) {
          return new src_1.StablePool(poolRaw);
        } else {
          return new src_1.WeightedPool(poolRaw);
        }
      }));
      const {
        denom: tokenInDenomOsmo,
        decimals: tokenInOsmoDecimals
      } = osmosisRoute.t0.symbol === swapTokenSent ? osmosisRoute.t0 : osmosisRoute.t1;
      const {
        denom: tokenOutDenomOsmo,
        decimals: tokenOutOsmoDecimals
      } = osmosisRoute.t0.symbol === swapTokenReceived ? osmosisRoute.t0 : osmosisRoute.t1;
      const tokenInAmount = (0, big_integer_1.default)(amount.multipliedBy(Math.pow(10, tokenInOsmoDecimals)).toFixed(0));
      const [osmo] = calc.calculateBestOsmosisSwapRoute({
        tokenInAmount,
        tokenOutDenom: tokenOutDenomOsmo,
        tokenInDenom: tokenInDenomOsmo
      });
      return (0, utils_1.convertCoinFromUDenomV2)((_a = osmo === null || osmo === void 0 ? void 0 : osmo.out) === null || _a === void 0 ? void 0 : _a.toString(), tokenOutOsmoDecimals);
    case "shade":
      const shadeRoute = route;
      const shadePairIds = lodash_1.default.map(shadeRoute, r => r.raw.id);
      const shadeCalc = new shade_calc_1.default(lodash_1.default.zipObject(shadePairIds, lodash_1.default.map(shadeRoute, r => r.raw)));
      const startToken = swapTokenSent === shadeRoute[0].t0.symbol ? shadeRoute[0].t0 : swapTokenSent === shadeRoute[0].t1.symbol ? shadeRoute[0].t1 : null;
      if(startToken === null) {
         throw new Error(`${swapTokenSent} doesn't match route.`);
      }
      try {
        const result = shadeCalc.calculatePathOutcome({
          path: shadePairIds,
          startingTokenAmount: amount.multipliedBy(Math.pow(10, startToken.decimals)),
          startingTokenId: startToken.id
        });

        const lastShadeRouteElement = lodash_1.default.last(shadeRoute); // shadeRoute are note necessarily sorted
        const endToken = swapTokenReceived === lastShadeRouteElement.t0.symbol ? lastShadeRouteElement.t0 : lastShadeRouteElement.t1;
        return (0, utils_1.convertCoinFromUDenomV2)(result.quoteOutputAmount, endToken.decimals);
      } catch (e) {
        if(e.message.includes('parameter error')) {
          throw new Error(`${swapTokenSent}-${endToken.symbol} doesn't match route.`)
        }
      }
    default:
      throw new Error(`Unsupported dex: ${dex} to calculate token swap ${amount.toString()} ${swapTokenSent} -> x ${swapTokenReceived}`);
  }
}

exports.default = calculateTokenSwap;
//# sourceMappingURL=index.js.map
