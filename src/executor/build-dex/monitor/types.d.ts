import BigNumber from "bignumber.js";
import { DexProtocolName, Route, SwapToken, SerializedRoute } from "../dex/types/dex-types";
import { StablePoolRaw, WeightedPoolRaw } from "../lib/@osmosis/packages/pools/src";
import { ShadeRoutePoolEssential, ShadeTokenEssential } from "../dex/shade/types";
import { DenomInfo } from "../dex/osmosis/types";
import { TokenPairInfoRaw } from "../dex/shade/shade-api-utils";
export interface ArbV1Raw {
    amount_bridge: number;
    amount_in: number;
    amount_out: number;
    bridge: any;
    dex_0: string;
    dex_1: string;
    id: string;
    last_ts: Date;
    route_0: SerializedRoute<DexProtocolName>;
    route_1: SerializedRoute<DexProtocolName>;
    token_0: string;
    token_1: string;
    ts: Date;
}
export interface ArbV1<T extends number | BigNumber> {
    amountBridge: T;
    amountIn: T;
    amountOut: T;
    bridge: any;
    dex0: DexProtocolName;
    dex1: DexProtocolName;
    id: string;
    route0: Route<DexProtocolName>;
    route1: Route<DexProtocolName>;
    token0: SwapToken;
    token1: SwapToken;
    lastTs: Date;
    ts: Date;
}
export declare function isShadePathRaw(poolRaw: WeightedPoolRaw | StablePoolRaw | ShadeRoutePoolEssential | TokenPairInfoRaw): poolRaw is ShadeRoutePoolEssential;
export declare function isShadeTokenEssential(denomInfo: DenomInfo | ShadeTokenEssential): denomInfo is ShadeTokenEssential;
export declare function serializeRoute<T extends DexProtocolName>(route: Route<T>): SerializedRoute<DexProtocolName>;
export declare function parseRoute<T extends DexProtocolName>(route: SerializedRoute<T>): Route<DexProtocolName>;
export declare function toRawArbV1(json: ArbV1<number>): ArbV1Raw;
export declare function parseRawArbV1Number(arb: ArbV1Raw): ArbV1<number>;
export declare function parseRawArbV1BigNumber(arb: ArbV1Raw): ArbV1<BigNumber>;
