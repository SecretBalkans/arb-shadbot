import BigNumber from "bignumber.js";
import { DexProtocolName, Route, SwapToken } from "../dex/types/dex-types";
export * from "../arbitrage/types";
export * from "../dex/types/dex-types";
export * from "../monitor/types";
export * from "../dex/shade/tokens";
export default function calculateTokenSwap<T extends DexProtocolName>(dex: T, swapTokenSent: SwapToken, swapTokenReceived: SwapToken, route: Route<T>, amount: BigNumber): BigNumber;
