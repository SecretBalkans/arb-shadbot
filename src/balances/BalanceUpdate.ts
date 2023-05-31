import {CHAIN} from "../ibc";
import {BalanceMap} from "./BalanceMap";
import {SerializedBalances} from "../wallet/ArbWallet";

export interface SerializedBalanceUpdate {
  chain: CHAIN,
  balances: SerializedBalances,
  diff: SerializedBalances,
}

export class BalanceUpdate {
  chain: CHAIN;
  balances: BalanceMap;
  diff: BalanceMap;

  constructor({chain, balances, diff}: { chain: CHAIN, balances: BalanceMap, diff: BalanceMap }) {
    this.chain = chain;
    this.balances = balances;
    this.diff = diff;
  }

  toJSON(): SerializedBalanceUpdate {
    return {
      chain: this.chain,
      balances: this.balances.toJSON(),
      diff: this.diff.toJSON(),
    };
  }
}
