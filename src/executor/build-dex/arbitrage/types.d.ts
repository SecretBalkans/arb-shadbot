import { DexProtocolName, SerializedRoute, SwapToken } from "../dex/types/dex-types";
export interface ArbPathParsed {
    id: string;
    reverseId: string;
    dex1: DexProtocolName;
    dex0: DexProtocolName;
    amountIn: number;
    amountBridge: number;
    amountOut: number;
    bridge: any[];
    route0: SerializedRoute<DexProtocolName>;
    route1: SerializedRoute<DexProtocolName>;
    error1: string;
    error0: string;
    pair: [SwapToken, SwapToken];
}
