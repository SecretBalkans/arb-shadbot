import {CHAIN, getChainInfo} from '../ibc';
import {Observable} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import cosmosObserver from '../wallet/CosmosObserver';
import {ArbWallet, BalanceMap, SerializedBalanceMap} from '../wallet/ArbWallet';
import _ from 'lodash';
import {Logger} from '../utils';
import {Amount, SwapToken, SwapTokenMap, Token} from '../ibc/dexTypes';
import EventEmitter from 'events';
import BigNumber from 'bignumber.js';
import {convertCoinFromUDenomV2} from '../utils/denoms';
import {MAX_IBC_FINISH_WAIT_TIME_DEFAULT} from '../executor/MoveIBC';
import {DenomInfo} from '../ibc/tokens';
import {execute} from "../graphql/gql-execute";
import gql from 'graphql-tag';

export interface SerializedBalanceUpdate {
  chain: CHAIN,
  balances: SerializedBalanceMap,
  diff: SerializedBalanceMap,
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

const logger = new Logger('BalancesInternal');

export function subscribeBalances(arb: ArbWallet): Observable<BalanceUpdate> {
  const balanceMap: Partial<Record<CHAIN, BalanceMap>> = {};
  return new Observable<BalanceUpdate>((obs) => {
    arb.supportedChains.forEach((chain) => {
      const chainInfo = getChainInfo(chain);
      cosmosObserver(chainInfo.rpc, 500).subscribe(() => {
        arb.getBalancesOnChain(chain).then(balances => {
          obs.next(new BalanceUpdate({
            chain,
            balances,
            diff: balances.diff(),
          }));
        }).catch(err => logger.error(err.message, chainInfo.rpc));
      }, err => obs.error(err));
    });
  }).pipe(filter((newBlockBalanceMap: BalanceUpdate) => {
    return !balanceMap[newBlockBalanceMap.chain]
      || _.some(balanceMap[newBlockBalanceMap.chain].tokenBalances, (b, token) => {
        return !b.amount.isEqualTo(newBlockBalanceMap.balances.tokenBalances[token]?.amount);
      })
      || _.some(newBlockBalanceMap.balances.tokenBalances, (b, token) => {
        return !b.amount.isEqualTo(balanceMap[newBlockBalanceMap.chain].tokenBalances[token]?.amount);
      });
  }), map((newBlockBalanceMap: BalanceUpdate) => {
    const diff = newBlockBalanceMap.balances.diff(balanceMap[newBlockBalanceMap.chain]);
    balanceMap[newBlockBalanceMap.chain] = newBlockBalanceMap.balances;
    return new BalanceUpdate({
      chain: newBlockBalanceMap.chain,
      balances: newBlockBalanceMap.balances,
      diff,
    });
  }));
}

export interface CanLog {
  logger: Logger;
}

export class BalanceMonitor implements CanLog {
  private readonly balances: Partial<Record<CHAIN, BalanceMap>> = {};
  logger: Logger;
  private enabledLocalDBUpdate: Boolean;

  constructor() {
    this.logger = new Logger('BalanceMonitor');
  }

  public readonly events = new EventEmitter();

  public getTokenAmount(chain: CHAIN, token: Token): Amount {
    return this.balances[chain]?.tokenBalances[token]?.amount || BigNumber(0);
  }

  public getFullTokenBalanceInfo(chain: CHAIN, token: Token): { amount: BigNumber, denomInfo: DenomInfo } {
    return this.balances[chain]?.tokenBalances[token]
  }

  public updateBalances(balanceUpdate: SerializedBalanceUpdate) {
    if (!this.balances[balanceUpdate.chain]) {
      this.balances[balanceUpdate.chain] = BalanceMap.fromSerializedUpdate(balanceUpdate);
    } else {
      this.balances[balanceUpdate.chain].updateBalances(balanceUpdate);
    }
    this.events.emit('balance', balanceUpdate);
  }

  private readonly BOT_ID = "dea2ae0b-9909-4c79-8e31-a9376957c3f6";

  public enableLocalDBUpdates() {
    if (!this.enabledLocalDBUpdate) {
      this.logger.log('Enabled local db bot balance updates!'.green);
      this.enabledLocalDBUpdate = true;
      this.events.on('balance', (balanceUpdate: SerializedBalanceUpdate) => {
        let balanceObject = {
          balances: _(balanceUpdate.balances).toPairs().map(([key, val]) => {
            return [SwapTokenMap[key], convertCoinFromUDenomV2(val.amount, val.denomInfo.decimals).toFixed(val.denomInfo.decimals)];
          }).fromPairs().value(),
          bot_id: this.BOT_ID,
          chain_id: balanceUpdate.chain
        };
        execute(gql`
            mutation updateBalances($object: bot_balances_insert_input! = {}) {
                insert_bot_balances_one (on_conflict: {constraint: bot_balances_bot_id_chain_id_key, update_columns: [balances, bot_id, chain_id]}, object: $object) {
                    id
                }
            }
        `, {
          object: balanceObject
        }).catch(err => this.logger.error('GQL', err))
      })
    }
  }

  public async waitForChainBalanceUpdate(chain: CHAIN, token: SwapToken, {
    maxWaitTime = MAX_IBC_FINISH_WAIT_TIME_DEFAULT,
    isBalanceCheck = false
  } = {}): Promise<Amount | false> {
    const swapToken = SwapTokenMap[token];
    const existingBalance = this.getTokenAmount(chain, SwapTokenMap[token]);
    if (isBalanceCheck) {
      return existingBalance;
    }

    return Promise.race([
      new Promise<false>(resolve => setTimeout(() => resolve(false), maxWaitTime)),
      new Promise<Amount>(resolve => {
        this.logger.log(`Waiting for ${isBalanceCheck ? 'balance' : 'transfer'} of ${token} to ${chain}...`.blue);
        const listener = (balanceUpdate: SerializedBalanceUpdate) => {
          const prop = isBalanceCheck ? 'balances' : 'diff';
          if (balanceUpdate.chain === chain && BigNumber(balanceUpdate[prop][swapToken]?.amount).isGreaterThan(0)) {
            this.events.removeListener('balance', listener);
            resolve(BigNumber(convertCoinFromUDenomV2(balanceUpdate[prop][swapToken]?.amount, balanceUpdate[prop][swapToken]?.denomInfo.decimals)));
          }
          return false;
        };
        this.events.on('balance', listener);
      })]);
  }
}
