"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStablePool = void 0;
const src_1 = require("../../lib/@osmosis/packages/pools/src");
const incentivizedPoolIds_1 = __importDefault(require("./incentivizedPoolIds"));
const unit_1 = require("@keplr-wallet/unit");
class OsmosisCalc {
    constructor(pools) {
        this.pools = pools;
        this.routers = {};
    }
    static getPairKey(tokenInDenom, tokenOutDenom) {
        return [tokenInDenom, tokenOutDenom].sort().join('-');
    }
    getPairRouter(tokenInDenom, tokenOutDenom) {
        const routerPairKey = OsmosisCalc.getPairKey(tokenInDenom, tokenOutDenom);
        if (!this.routers[routerPairKey]) {
            this.routers[routerPairKey] = new src_1.OptimizedRoutes(this.pools, incentivizedPoolIds_1.default, 'uosmo');
        }
        return this.routers[routerPairKey];
    }
    calculateBestOsmosisSwapRoute({ tokenInDenom, tokenInAmount, tokenOutDenom, }) {
        const int = tokenInAmount.toString();
        const router = this.getPairRouter(tokenInDenom, tokenOutDenom);
        const routes = router.getOptimizedRoutesByTokenIn({
            denom: tokenInDenom,
            amount: new unit_1.Int(int),
        }, tokenOutDenom, 4, 3);
        return routes.map(r => ({
            amount: r.amount,
            pools: r.pools,
            out: router.calculateTokenOutByTokenIn(routes).amount,
        }));
    }
}
exports.default = OsmosisCalc;
function isStablePool(poolRaw) {
    return poolRaw['@type'] === '/osmosis.gamm.poolmodels.stableswap.v1beta1.Pool';
}
exports.isStablePool = isStablePool;
//# sourceMappingURL=osmosis-calc.js.map