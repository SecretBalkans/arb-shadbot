import { PoolId, Token } from '../types/dex-types';
import { SecretContractAddress, SnipPoolToken } from './types';
export declare function toTokenId(shadeToken: SnipPoolToken): Token;
export declare function getShadeTokenById(id: string): any;
export declare function extractShadeTokenSymbolById(id: string): string;
export declare function extractShadeTokenSymbol(shadeToken: any): string;
export declare function getShadeTokenBySymbol(symbol: Token): {
    id: PoolId;
    symbol: string;
    decimals: number;
    contract_address: SecretContractAddress;
    code_hash: string;
};
