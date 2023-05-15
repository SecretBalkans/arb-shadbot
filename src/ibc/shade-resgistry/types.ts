import { Brand } from "../../ts";
export interface Contract {
  'address': SecretContractAddress;
  'code_hash': string;
}

export interface SnipPoolToken extends Snip20Token {
  amount?: number;
  price?: number;
}

export interface Snip20Token extends Contract {
  'name': string,
  'symbol': string,
  'decimals': number,
  'total_supply': AmountString,
}

export type SecretContractAddress = Brand<string, "ContractAddress">;
export type AmountString = Brand<string, "Amount">;
