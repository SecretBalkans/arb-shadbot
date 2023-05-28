"use strict";
/* tslint:disable:one-variable-per-declaration */
// noinspection CommaExpressionJS
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTradeSize = exports.calculateXYKToken1AmountFromToken0Amount = exports.calculateXYKToken0AmountFromToken1Amount = exports.getTradeInputOfSimulateReverseToken1WithToken0Trade = exports.getTradeInputOfSimulateReverseToken0WithToken1Trade = exports.calculateXYKPriceImpactFromToken1Amount = exports.Ro = exports.calculateXYKPriceImpactFromToken0Amount = exports.Fo = exports.calculateStableSwapPriceImpactInputToken1 = exports.stableSwapToken1ToToken0InPool = exports.calculateStableSwapPriceImpactInputToken0 = exports.stableSwapToken0ToToken1InPool = exports.printShadeSwapRoute = exports.findShadePaths = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
class StableSwapSimulator {
    constructor(e, t, n, o, s, a, r, l, d, u, p) {
        bignumber_js_1.default.set({
            DECIMAL_PLACES: 30,
        }),
            this.pool0Size = e,
            this.pool1Size = t,
            this.priceOfToken1 = n,
            this.a = o,
            this.gamma1 = s,
            this.gamma2 = a,
            this.lpFee = r,
            this.shadeDaoFee = l,
            this.invariant = this.calculateInvariant(),
            this.minTradeSize0For1 = d,
            this.minTradeSize1For0 = u,
            this.priceImpactLimit = p;
    }
    solveInvFnForPool1Size(e) {
        const t = e.dividedBy(this.invariant), n = a => this.invariantFnFromPoolSizes(t, a), o = a => this.derivRespectToPool1OfInvFn(t, a);
        return this.findZeroWithPool1Params(n, o).multipliedBy(this.invariant).dividedBy(this.priceOfToken1);
    }
    solveInvFnForPool0Size(e) {
        const t = e.dividedBy(this.invariant), n = a => this.invariantFnFromPoolSizes(a, t), o = a => this.derivRespectToPool0OfInvFnFromPool0(a, t);
        return this.findZeroWithPool0Params(n, o).multipliedBy(this.invariant);
    }
    swapToken0WithToken1(e) {
        const t = this.simulateToken0WithToken1Trade(e);
        return this.executeTrade(t);
    }
    swapToken1WithToken0(e) {
        const t = this.simulateToken1WithToken0Trade(e);
        return this.executeTrade(t);
    }
    executeTrade(e) {
        return this.pool0Size = e.newPool0,
            this.pool1Size = e.newPool1,
            this.calculateInvariant(),
            e.tradeReturn;
    }
    simulateReverseToken0WithToken1Trade(e) {
        const t = this.lpFee.multipliedBy(e), n = this.shadeDaoFee.multipliedBy(e), o = t.plus(n), s = e.minus(o), a = this.pool1Size.minus(e), r = a.multipliedBy(this.priceOfToken1), l = this.solveInvFnForPool0Size(r);
        this.verifySwapPriceImpactInBounds(l, a, !0);
        const d = l.minus(this.pool0Size);
        validateTradeSize(d, this.minTradeSize0For1);
        const u = a.plus(t);
        return {
            newPool0: l,
            newPool1: u,
            tradeInput: d,
            tradeReturn: s,
            lpFeeAmount: t,
            shadeDaoFeeAmount: n,
        };
    }
    simulateReverseToken1WithToken0Trade(e) {
        const t = this.lpFee.multipliedBy(e), n = this.shadeDaoFee.multipliedBy(e), o = t.plus(n), s = e.minus(o), a = this.pool0Size.minus(e), r = this.solveInvFnForPool1Size(a);
        this.verifySwapPriceImpactInBounds(a, r, !1);
        const l = r.minus(this.pool1Size);
        return validateTradeSize(l, this.minTradeSize1For0),
            {
                newPool0: a.plus(t),
                newPool1: r,
                tradeInput: l,
                tradeReturn: s,
                lpFeeAmount: t,
                shadeDaoFeeAmount: n,
            };
    }
    simulateToken0WithToken1Trade(e) {
        validateTradeSize(e, this.minTradeSize0For1);
        const t = this.pool0Size.plus(e), n = this.solveInvFnForPool1Size(t);
        this.verifySwapPriceImpactInBounds(t, n, !0);
        const o = this.pool1Size.minus(n), s = this.lpFee.multipliedBy(o), a = this.shadeDaoFee.multipliedBy(o), r = n.plus(s);
        return {
            newPool0: t,
            newPool1: r,
            tradeReturn: o.minus(s).minus(a),
            lpFeeAmount: s,
            shadeDaoFeeAmount: a,
        };
    }
    simulateToken1WithToken0Trade(e) {
        validateTradeSize(e, this.minTradeSize1For0);
        const t = this.pool1Size.plus(e), n = this.priceOfToken1.multipliedBy(t), o = this.solveInvFnForPool0Size(n);
        this.verifySwapPriceImpactInBounds(o, t, !1);
        const s = this.pool0Size.minus(o), a = this.lpFee.multipliedBy(s), r = this.shadeDaoFee.multipliedBy(s);
        return {
            newPool0: o.plus(a),
            newPool1: t,
            tradeReturn: s.minus(a).minus(r),
            lpFeeAmount: a,
            shadeDaoFeeAmount: r,
        };
    }
    verifySwapPriceImpactInBounds(e, t, n) {
        const o = this.priceImpactAt(e, t, n);
        if (o.isGreaterThan(this.priceImpactLimit) || o.isLessThan((0, bignumber_js_1.default)(0)))
            throw Error(`The slippage of this trade is outside of the acceptable range of 0% - ${this.priceImpactLimit}%.`);
    }
    priceImpactAt(e, t, n) {
        const o = n ? this.priceToken1() : this.priceToken0();
        return (n ? this.priceToken1At(e, t) : this.priceToken0At(e, t)).dividedBy(o).minus((0, bignumber_js_1.default)(1)).multipliedBy(100);
    }
    priceImpactToken0ForToken1(e) {
        const t = this.pool0Size.plus(e), n = this.solveInvFnForPool1Size(t);
        return this.priceImpactAt(t, n, !0);
    }
    priceImpactToken1ForToken0(e) {
        const t = this.pool1Size.plus(e), n = this.solveInvFnForPool0Size(this.priceOfToken1.multipliedBy(t));
        return this.priceImpactAt(n, t, !1);
    }
    negativeTangent(e, t) {
        return this.derivRespectToPool0OfInvFnFromPool0(e, t).dividedBy(this.derivRespectToPool1OfInvFn(e, t)).dividedBy(this.priceOfToken1);
    }
    priceToken1At(e, t) {
        return (0, bignumber_js_1.default)(1).dividedBy(this.negativeTangent(e.dividedBy(this.invariant), this.priceOfToken1.multipliedBy(t).dividedBy(this.invariant)));
    }
    priceToken1() {
        return this.priceToken1At(this.pool0Size, this.pool1Size);
    }
    priceToken0At(e, t) {
        return this.negativeTangent(e.dividedBy(this.invariant), this.priceOfToken1.multipliedBy(t).dividedBy(this.invariant));
    }
    priceToken0() {
        return this.priceToken0At(this.pool0Size, this.pool1Size);
    }
    updatePriceOfToken1(e) {
        this.priceOfToken1 = e,
            this.calculateInvariant();
    }
    token1TvlInUnitsToken0() {
        return this.priceOfToken1.multipliedBy(this.pool1Size);
    }
    totalTvl() {
        return this.pool0Size.plus(this.token1TvlInUnitsToken0());
    }
    geometricMeanDoubled() {
        const e = this.token1TvlInUnitsToken0();
        return this.pool0Size.isLessThanOrEqualTo((0, bignumber_js_1.default)(1)) || e.isLessThanOrEqualTo((0, bignumber_js_1.default)(1)) ? (0, bignumber_js_1.default)(0) : this.pool0Size.sqrt().multipliedBy(e.sqrt()).multipliedBy((0, bignumber_js_1.default)(2));
    }
    calculateInvariant() {
        const e = this.token1TvlInUnitsToken0(), t = this.pool0Size.isLessThanOrEqualTo(e) ? this.gamma1 : this.gamma2, n = a => this.invariantFnFromInv(a, t), o = a => this.derivRespectToInvOfInvFn(a, t), s = this.findZeroWithInvariantParams(n, o);
        return this.invariant = s,
            s;
    }
    invariantFnFromInv(e, t) {
        const n = this.token1TvlInUnitsToken0(), s = this.getCoeffScaledByInv(e, t, n).multipliedBy(e.multipliedBy(this.pool0Size.plus(n.minus(e)))), a = this.pool0Size.multipliedBy(n), r = e.multipliedBy(e).dividedBy(4);
        return s.plus(a).minus(r);
    }
    derivRespectToInvOfInvFn(e, t) {
        const n = this.token1TvlInUnitsToken0(), o = this.getCoeffScaledByInv(e, t, n), s = (0, bignumber_js_1.default)(-2).multipliedBy(t).plus(1).multipliedBy(this.pool0Size.minus(e).plus(n)).minus(e);
        return o.multipliedBy(s).minus(e.dividedBy(2));
    }
    getCoeffScaledByInv(e, t, n) {
        return this.a.multipliedBy((0, bignumber_js_1.default)(4).multipliedBy(this.pool0Size.dividedBy(e)).multipliedBy(n.dividedBy(e)).pow(t));
    }
    getCoeff(e, t, n) {
        const o = e.multipliedBy(t);
        return this.a.multipliedBy((0, bignumber_js_1.default)(4).multipliedBy(o).pow(n));
    }
    invariantFnFromPoolSizes(e, t) {
        const n = e.isLessThanOrEqualTo(t) ? this.gamma1 : this.gamma2, o = e.multipliedBy(t);
        return this.getCoeff(e, t, n).multipliedBy(e.plus(t).minus(1)).plus(o).minus(.25);
    }
    derivRespectToPool0OfInvFnFromPool0(e, t) {
        const n = e.isLessThanOrEqualTo(t) ? this.gamma1 : this.gamma2, o = this.getCoeff(e, t, n), s = n.multipliedBy(e.plus(t).minus(1)).dividedBy(e).plus(1);
        return o.multipliedBy(s).plus(t);
    }
    derivRespectToPool1OfInvFn(e, t) {
        const n = e.isLessThanOrEqualTo(t) ? this.gamma1 : this.gamma2, o = this.getCoeff(e, t, n), s = n.multipliedBy(e.plus(t).minus(1).dividedBy(t)).plus(1);
        return o.multipliedBy(s).plus(e);
    }
    findZeroWithInvariantParams(e, t) {
        const n = this.totalTvl();
        return S(e, t, n, n, !0, this.geometricMeanDoubled.bind(this), void 0);
    }
    findZeroWithPool0Params(e, t) {
        const n = this.pool0Size.dividedBy(this.invariant);
        return S(e, t, n, n, !1, void 0, (0, bignumber_js_1.default)(0));
    }
    findZeroWithPool1Params(e, t) {
        const n = this.token1TvlInUnitsToken0().dividedBy(this.invariant);
        return S(e, t, n, n, !1, void 0, (0, bignumber_js_1.default)(0));
    }
}
function findShadePaths({ startingTokenId: startingTokenId, endingTokenId: endingTokenId, maxHops: maxHops, pools: pools, }) {
    const tmpArr = [], result = [], someSet = new Set();
    function theFunction(f, someIndex) {
        if (!(someIndex > maxHops)) {
            if (f === endingTokenId) {
                result.push([...tmpArr]);
                return;
            }
            Object.entries(pools).forEach(([F, P]) => {
                // tslint:disable-next-line:no-unused-expression
                someSet.has(F) || (P.token0Id === f || P.token1Id === f) && (tmpArr.push(F),
                    someSet.add(F),
                    P.token0Id === f ? theFunction(P.token1Id, someIndex + 1) : theFunction(P.token0Id, someIndex + 1),
                    someSet.delete(F),
                    tmpArr.pop());
            });
        }
    }
    return theFunction(startingTokenId, 0),
        result;
}
exports.findShadePaths = findShadePaths;
function printShadeSwapRoute(route) {
    console.dir({
        inputAmount: route.inputAmount.toString(),
        quoteOutputAmount: route.quoteOutputAmount.toString(),
        quoteShadeDaoFee: route.quoteShadeDaoFee.toString(),
        quoteLPFee: route.quoteLPFee.toString(),
        priceImpact: route.priceImpact.toString(),
        route: route.route,
    }, { depth: 5 });
}
exports.printShadeSwapRoute = printShadeSwapRoute;
function stableSwapToken0ToToken1InPool(stablePoolParams) {
    const { inputToken0Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, } = stablePoolParams;
    function m() {
        return bignumber_js_1.default.set({
            DECIMAL_PLACES: 30,
        }), new StableSwapSimulator(e, t, n, o, s, a, r, l, d, u, p);
    }
    return m().swapToken0WithToken1(i);
}
exports.stableSwapToken0ToToken1InPool = stableSwapToken0ToToken1InPool;
/** PriceImpact */
function calculateStableSwapPriceImpactInputToken0({ inputToken0Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }) {
    function m() {
        return bignumber_js_1.default.set({
            DECIMAL_PLACES: 30,
        }),
            new StableSwapSimulator(e, t, n, o, s, a, r, l, d, u, p);
    }
    const h = m(), f = h.priceToken1(), g = h.swapToken0WithToken1(i).dividedBy((0, bignumber_js_1.default)(1).minus(r.plus(l)));
    return i.dividedBy(g).dividedBy(f).minus(1);
}
exports.calculateStableSwapPriceImpactInputToken0 = calculateStableSwapPriceImpactInputToken0;
function stableSwapToken1ToToken0InPool({ inputToken1Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }) {
    function m() {
        return bignumber_js_1.default.set({
            DECIMAL_PLACES: 30,
        }),
            new StableSwapSimulator(e, t, n, o, s, a, r, l, d, u, p);
    }
    return m().swapToken1WithToken0(i);
}
exports.stableSwapToken1ToToken0InPool = stableSwapToken1ToToken0InPool;
function calculateStableSwapPriceImpactInputToken1({ inputToken1Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }) {
    function m() {
        return bignumber_js_1.default.set({
            DECIMAL_PLACES: 30,
        }),
            new StableSwapSimulator(e, t, n, o, s, a, r, l, d, u, p);
    }
    const h = m(), f = h.priceToken0(), g = h.swapToken1WithToken0(i).dividedBy((0, bignumber_js_1.default)(1).minus(r.plus(l)));
    return i.dividedBy(g).dividedBy(f).minus(1);
}
exports.calculateStableSwapPriceImpactInputToken1 = calculateStableSwapPriceImpactInputToken1;
function Fo({ token0LiquidityAmount: i, token1LiquidityAmount: e, token0InputAmount: t, fee: n }) {
    const o = e.minus(i.multipliedBy(e).dividedBy(i.plus(t))), s = o.minus(o.multipliedBy(n));
    return (0, bignumber_js_1.default)(s.toFixed(0));
}
exports.Fo = Fo;
function calculateXYKPriceImpactFromToken0Amount({ token0LiquidityAmount: i, token1LiquidityAmount: e, token0InputAmount: t, }) {
    const n = i.dividedBy(e), o = i.multipliedBy(e), s = i.plus(t), a = o.dividedBy(s), r = e.minus(a);
    return t.dividedBy(r).dividedBy(n).minus(1);
}
exports.calculateXYKPriceImpactFromToken0Amount = calculateXYKPriceImpactFromToken0Amount;
function Ro({ token0LiquidityAmount: i, token1LiquidityAmount: e, token1InputAmount: t, fee: n }) {
    const o = i.minus(i.multipliedBy(e).dividedBy(e.plus(t))), s = o.minus(o.multipliedBy(n));
    return (0, bignumber_js_1.default)(s.toFixed(0));
}
exports.Ro = Ro;
function calculateXYKPriceImpactFromToken1Amount({ token0LiquidityAmount: i, token1LiquidityAmount: e, token1InputAmount: t, }) {
    const n = e.dividedBy(i), o = e.multipliedBy(i), s = e.plus(t), a = o.dividedBy(s), r = i.minus(a);
    return t.dividedBy(r).dividedBy(n).minus(1);
}
exports.calculateXYKPriceImpactFromToken1Amount = calculateXYKPriceImpactFromToken1Amount;
function getTradeInputOfSimulateReverseToken0WithToken1Trade({ outputToken1Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }) {
    function m() {
        return bignumber_js_1.default.set({
            DECIMAL_PLACES: 30,
        }),
            new StableSwapSimulator(e, t, n, o, s, a, r, l, d, u, p);
    }
    const h = r.plus(l), f = i.dividedBy((0, bignumber_js_1.default)(1).minus(h));
    return m().simulateReverseToken0WithToken1Trade(f).tradeInput;
}
exports.getTradeInputOfSimulateReverseToken0WithToken1Trade = getTradeInputOfSimulateReverseToken0WithToken1Trade;
function getTradeInputOfSimulateReverseToken1WithToken0Trade({ outputToken0Amount: i, poolToken0Amount: e, poolToken1Amount: t, priceRatio: n, a: o, gamma1: s, gamma2: a, liquidityProviderFee: r, daoFee: l, minTradeSizeToken0For1: d, minTradeSizeToken1For0: u, priceImpactLimit: p, }) {
    function m() {
        return bignumber_js_1.default.set({
            DECIMAL_PLACES: 30,
        }),
            new StableSwapSimulator(e, t, n, o, s, a, r, l, d, u, p);
    }
    const h = r.plus(l), f = i.dividedBy((0, bignumber_js_1.default)(1).minus(h));
    return m().simulateReverseToken1WithToken0Trade(f).tradeInput;
}
exports.getTradeInputOfSimulateReverseToken1WithToken0Trade = getTradeInputOfSimulateReverseToken1WithToken0Trade;
function calculateXYKToken0AmountFromToken1Amount({ token0LiquidityAmount: i, token1LiquidityAmount: e, token1OutputAmount: t, fee: n, }) {
    if (t.isGreaterThanOrEqualTo(e))
        throw Error('Not enough liquidity for swap');
    const o = i.multipliedBy(e).dividedBy(t.dividedBy((0, bignumber_js_1.default)(1).minus(n)).minus(e)).plus(i).multipliedBy(-1);
    return (0, bignumber_js_1.default)(o.toFixed(0));
}
exports.calculateXYKToken0AmountFromToken1Amount = calculateXYKToken0AmountFromToken1Amount;
function calculateXYKToken1AmountFromToken0Amount({ token0LiquidityAmount: i, token1LiquidityAmount: e, token0OutputAmount: t, fee: n, }) {
    if (t.isGreaterThanOrEqualTo(i))
        throw Error('Not enough liquidity for swap');
    const o = e.multipliedBy(i).dividedBy(t.dividedBy((0, bignumber_js_1.default)(1).minus(n)).minus(i)).plus(e).multipliedBy(-1);
    return (0, bignumber_js_1.default)(o.toFixed(0));
}
exports.calculateXYKToken1AmountFromToken0Amount = calculateXYKToken1AmountFromToken0Amount;
function validateTradeSize(i, e) {
    if (i.isNaN()) {
        throw new Error('Trade size NaN');
    }
    if (i.isLessThanOrEqualTo(0))
        throw Error('Trade size must be positive');
    if (i.isLessThanOrEqualTo(e))
        throw Error(`Trade size must be larger than minimum trade size of ${e}`);
}
exports.validateTradeSize = validateTradeSize;
function S(i, e, t, n, o, s, a) {
    const r = (0, bignumber_js_1.default)(1e-16), l = 80, d = 150;
    try {
        const u = J(i, e, t, r, l);
        if (!o || u.isGreaterThanOrEqualTo(0))
            return u;
    }
    catch (u) {
        if (!(u instanceof NewtonMethodError))
            throw u;
    }
    if (a !== void 0)
        return A(i, a, n, r, d);
    if (s !== void 0)
        return A(i, s(), n, r, d);
    throw Error('No lower bound was found for bisect');
}
function A(i, e, t, n, o) {
    const s = i(e), a = i(t);
    if (s.isEqualTo(0))
        return e;
    if (a.isEqualTo(0))
        return t;
    if (s.isGreaterThan(0) && a.isGreaterThan(0) || s.isLessThan(0) && a.isLessThan(0))
        throw Error('bisect endpoints must have different signs');
    let r = t.minus(e), l = e;
    for (let d = 0; d < o; d += 1) {
        r = r.multipliedBy((0, bignumber_js_1.default)(.5));
        const u = l.plus(r), p = i(u);
        // tslint:disable-next-line:no-conditional-assignment
        if (s.multipliedBy(p).isGreaterThanOrEqualTo(0) && (l = u),
            p || r.abs().isLessThanOrEqualTo(n))
            return u;
    }
    throw Error('Bisect exceeded max iterations');
}
function J(i, e, t, n, o) {
    let s = t;
    for (let a = 0; a < o; a += 1) {
        const r = s, l = i(s), d = e(s);
        if (d.isEqualTo(0))
            throw new NewtonMethodError('Newton encountered slope of 0');
        // tslint:disable-next-line:no-conditional-assignment
        if (s = s.minus(l.dividedBy(d)),
            s.minus(r).abs().isLessThanOrEqualTo(n))
            return s;
    }
    throw new NewtonMethodError('Newton exceeded max iterations');
}
// tslint:disable-next-line:max-classes-per-file
class NewtonMethodError extends Error {
    constructor(e) {
        super(e),
            this.name = 'NewtonMethodError';
    }
}
//# sourceMappingURL=shade-calc-utils.js.map