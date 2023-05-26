import {CHAIN, getChainByChainId, getChainInfo} from '../ibc';
import {Observable} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import cosmosObserver from '../wallet/CosmosObserver';
import {ArbWallet, BalanceMap, SerializedBalances} from '../wallet/ArbWallet';
import _ from 'lodash';
import {Logger} from '../utils';
import EventEmitter from 'events';
import BigNumber from 'bignumber.js';
import {MAX_IBC_FINISH_WAIT_TIME_DEFAULT} from '../executor/MoveIBC';
import {execute} from "../graphql/gql-execute";
import gql from 'graphql-tag';
import {Amount, SwapToken, SwapTokenMap, Token} from "../executor/build-dex/dexSdk";

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

const logger = new Logger('BalancesInternal');

export function subscribeBalances(arb: ArbWallet): Observable<BalanceUpdate> {
  const balanceMap: Partial<Record<CHAIN, BalanceMap>> = {};
  return new Observable<BalanceUpdate>((obs) => {
    arb.supportedChains.forEach((chain) => {
      const chainInfo = getChainInfo(chain);
      cosmosObserver(chainInfo.rpc, 500).subscribe(() => {
        arb.getBalancesOnChain(chain).then(balances => {
          if(!balances) { // sometimes we miss balance check - i.e. when fetching Secret balances.
            return;
          }
          obs.next(new BalanceUpdate({
            chain,
            balances,
            diff: balances,
          }));
        }).catch(err => logger.error('GetBalances', err.message, chain === CHAIN.Secret ? chainInfo.rest : chainInfo.rpc));
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

  private readonly _internalEvents = new EventEmitter();

  public getTokenAmount(chain: CHAIN, token: Token, isWrapped: boolean | 'both'): Amount | false {
    return this.getTokenInfoInternal(this.balances[chain]?.tokenBalances, token, isWrapped)?.amount;
  }

  public getTokenInfoInternal<T extends {token: P, amount: P, denomInfo: K}, P extends string | BigNumber, K extends {decimals: number, isWrapped?: boolean}>(balances: T[], token: string, isWrapped: boolean | 'both'): T | undefined {
    return _.find(balances, ({token: t, denomInfo: {isWrapped: w}}) => {
      return token === t && !!w === !!isWrapped;
    }) as any as T | undefined;
  }

  public updateBalances(balanceUpdate: SerializedBalanceUpdate): BalanceUpdate {
    let realBalanceUpdate: BalanceUpdate;
    if (!this.balances[balanceUpdate.chain]) {
      this.balances[balanceUpdate.chain] = BalanceMap.fromSerializedBalanceUpdate(balanceUpdate);
      realBalanceUpdate = new BalanceUpdate({
        chain: balanceUpdate.chain,
        balances: BalanceMap.fromSerializedBalanceUpdate(balanceUpdate),
        diff: BalanceMap.fromSerializedBalanceUpdate(balanceUpdate)
      });
    } else {
      realBalanceUpdate = this.balances[balanceUpdate.chain].updateBalanceMap(balanceUpdate);
    }
    this._internalEvents.emit('balanceUpdate.chain', realBalanceUpdate.chain);
    this._internalEvents.emit('balanceUpdate', realBalanceUpdate);
    return realBalanceUpdate;
  }

  private readonly BOT_ID = "dea2ae0b-9909-4c79-8e31-a9376957c3f6";

  public enableLocalDBUpdates() {
    if (!this.enabledLocalDBUpdate) {
      this.logger.log('Enabled local db bot balance updates!'.green);
      this.enabledLocalDBUpdate = true;
      this._internalEvents.on('balanceUpdate.chain', (chain: CHAIN) => {
        let balanceObject = {
          balances: _(this.balances[chain].tokenBalances).map((val) => {
            let amount = val.amount.toFixed(val.denomInfo.decimals);
            let token = SwapTokenMap[val.token];
            if (val.denomInfo.isWrapped && (token === SwapToken.SCRT || getChainByChainId(val.denomInfo.chainId) !== CHAIN.Secret)) {
              return [`s${token}`, amount];
            } else {
              return [token, amount];
            }
          }).fromPairs().value(),
          bot_id: this.BOT_ID,
          chain_id: chain
        };
        execute(gql`
            mutation updateBalances($object: bot_balances_insert_input! = {}) {
                insert_bot_balances_one (on_conflict: {constraint: bot_balances_bot_id_chain_id_key, update_columns: [balances, bot_id, chain_id]}, object: $object) {
                    id
                }
            }
        `, {
          object: balanceObject
        }).catch(err => {
          let message = err.message;
          try {
            message = JSON.parse(err.message.replace('Fetch error: ', '')).message;
          } catch {
          }
          this.logger.debugOnce('local.gql.updates', message);
        })
      })
    }
  }

  public async waitForChainBalanceUpdate(chain: CHAIN, token: SwapToken, {
    maxWaitTime = MAX_IBC_FINISH_WAIT_TIME_DEFAULT,
    isWrapped = false,
    isBalanceCheck = false
  }: {
    maxWaitTime?:number,
    isWrapped?: boolean,
    isBalanceCheck?: boolean
  } = {}): Promise<Amount | false> {
    const swapToken = SwapTokenMap[token];
    let tokenAmount = this.getTokenAmount(chain, swapToken, isWrapped);
     if (isBalanceCheck) {
      return tokenAmount || BigNumber(0);
    }

    // TODO: for secret send a message to Monitor to keep looking
    //  only for a single token to avoid waiting too long and wait for that message
    return Promise.race([
      new Promise<false>(resolve => setTimeout(() => resolve(false), maxWaitTime)),
      new Promise<Amount>(resolve => {
        this.logger.log(`Waiting for ${isBalanceCheck ? 'balance' : 'deposit'} of ${isWrapped ? 's': ''}${token} on ${chain}...`.blue);
        const listener = (balanceUpdate: BalanceUpdate) => {
          const prop = isBalanceCheck ? 'balances' : 'diff';
          let amount = this.getTokenInfoInternal(balanceUpdate[prop].tokenBalances, swapToken,isWrapped)?.amount;
          if (balanceUpdate.chain === chain && amount?.isGreaterThan(0)) {
            this._internalEvents.removeListener('balanceUpdate.serialized', listener);
            resolve(amount);
          }
          return false;
        };
        this._internalEvents.on('balanceUpdate', listener);
      })]);
  }
}
