import { SerializedShadeContract, ShadeContract, ShadeRoutePoolEssential, Snip20Token, SnipPoolToken, StakingContract, TokenPriceInfo } from "./types";
export declare let tokens: any;
export declare let pairs: any;
export declare class ShadePair {
    readonly token0: SnipPoolToken;
    readonly token1: SnipPoolToken;
    readonly lpTokenInfo?: Snip20Token;
    readonly rawInfo?: TokenPairInfoRaw;
    readonly stakingContract?: ShadeContract | StakingContract;
    readonly name: string;
    constructor(token0: SnipPoolToken, token1: SnipPoolToken, lpTokenInfo?: Snip20Token, rawInfo?: TokenPairInfoRaw, stakingContract?: ShadeContract | StakingContract);
    get token0PoolPrice(): number;
    get token1PoolPrice(): number;
    get skew(): number;
    get skewSign(): 1 | -1;
    get skewPercentage(): number;
}
export interface TokenPairInfoRaw {
    id: string;
    contract: SerializedShadeContract;
    /**
     * token_0 : "06180689-1c8e-493d-a19f-71dbc5dddbfc"
     * token_0_amount : "132661431360"
     * token_1 : "7524b771-3540-4829-aff1-c6d42b424e61"
     * token_1_amount : "499623041187"
     */
    token_0: string;
    token_0_amount: string;
    token_1: string;
    token_1_amount: string;
    lp_token: string;
    staking_contract?: {
        'id': string;
        'address': string;
        'code_hash': string;
    };
    /**
     * {
     *     "a": "150",
     *     "gamma1": "2",
     *     "gamma2": "50",
     *     "min_trade_size_0_to_1": "0.0001",
     *     "min_trade_size_1_to_0": "0.0001",
     *     "max_price_impact_allowed": "1000",
     *     "price_ratio": "0.948439957804714905975629335"
     *   }
     */
    stable_params: {
        'a': string;
        'gamma1': string;
        'gamma2': string;
        'min_trade_size_0_to_1': string;
        'min_trade_size_1_to_0': string;
        'max_price_impact_allowed': string;
        'price_ratio': string;
    };
    volume?: {
        'volume': string;
        'volume_24h_change': string;
        'volume_24h_change_perc': string;
    };
    fees?: {
        'dao': string;
        'lp': string;
    };
    liquidity?: string;
    liquidity_usd?: string;
    apy?: {
        'total': number;
        'reward_tokens': [
            {
                'token_id': string;
                'apy': number;
                'percentage_of_total': number;
            },
            {
                'token_id': string;
                'apy': number;
                'percentage_of_total': number;
            }
        ];
    };
    currency?: string;
    flags: string[];
}
export declare function getPairsRaw(cached?: boolean): Promise<TokenPairInfoRaw[]>;
export declare function initShadeTokens(): Promise<void>;
export declare function getTokenPrices(): Promise<TokenPriceInfo[]>;
export declare const useTokens: () => {
    getTokenDecimals: typeof getTokenDecimals;
};
export declare function getTokenDecimals(tokenId: string): number;
export declare function parseRawPool(n: TokenPairInfoRaw, t0decimals: number, t1decimals: number): ShadeRoutePoolEssential;
export declare function toRawShadePool(parsedPool: ShadeRoutePoolEssential, t0Decimals: number, t1Decimals: number): TokenPairInfoRaw;
