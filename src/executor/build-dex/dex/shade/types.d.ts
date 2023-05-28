import { Amount, Brand } from "../types/dex-types";
import { TokenPairInfoRaw } from "./shade-api-utils";
export interface TokenPriceInfo {
    id: string;
    name: string;
    value: string;
}
export type ShadeTokenEssential = RawShadeContract & {
    logo_path: string;
    symbol: string;
    decimals: number;
    id: string;
};
export type ShadeRouteSegmentInfo = {
    t0: ShadeTokenEssential;
    t1: ShadeTokenEssential;
    raw: ShadeRoutePoolEssential;
};
export type SerializedShadeRouteSegmentInfo = {
    t0: ShadeTokenEssential;
    t1: ShadeTokenEssential;
    raw: TokenPairInfoRaw;
};
export interface ShadeContractJson {
    'address': SecretContractAddress;
    'codeHash': string;
}
export interface RawShadeContract {
    'contract_address': string;
    'code_hash': string;
}
export interface ShadeContract {
    'address': SecretContractAddress;
    'code_hash': string;
}
export interface SerializedShadeContract {
    'address': string;
    'code_hash': string;
}
export interface SnipPoolToken extends Snip20Token {
    amount?: number;
    price?: number;
}
export interface Snip20Token extends ShadeContract {
    'name': string;
    'symbol': string;
    'decimals': number;
    'total_supply': AmountString;
}
export type SecretContractAddress = Brand<string, "ContractAddress">;
export type AmountString = Brand<string, "Amount">;
export type Timestamp = Brand<number, "Timestamp">;
export interface StakingContract extends ShadeContract {
    'lp_token': ShadeContract;
    'amm_pair': SecretContractAddress;
    'admin_auth': ShadeContract;
    'query_auth': ShadeContract;
    'total_amount_staked': AmountString;
    'reward_tokens': {
        'token': Snip20Token;
        'decimals': number;
        'reward_per_second': AmountString;
        'reward_per_staked_token': AmountString;
        'valid_to': Timestamp;
        'last_updated': Timestamp;
    }[];
}
export interface ShadeRoutePoolParsed extends ShadeRoutePoolEssential {
    stakingContract: any;
    metrics: {
        volume: any;
        liquidity: Amount;
        currency: any;
        apy: any;
    };
    rewardTokens: any;
}
export interface ShadeRoutePoolEssential {
    fees: any;
    token1Id: any;
    lpTokenId: any;
    token0Id: any;
    contract: ShadeContractJson;
    token0Amount: Amount;
    stableParams: any;
    id: any;
    flags: string[];
    token1Amount: Amount;
}
