import {CHAIN, getChainByChainId, getChainInfo} from '../ibc';
import {Observable} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import cosmosObserver from '../wallet/CosmosObserver';
import {ArbWallet, BalanceMap, SerializedBalances} from '../wallet/ArbWallet';
import _ from 'lodash';
import {Logger} from '../utils';
import {Amount, SwapToken, SwapTokenMap, Token} from '../ibc';
import EventEmitter from 'events';
import BigNumber from 'bignumber.js';
import {convertCoinFromUDenomV2} from '../utils/denoms';
import {MAX_IBC_FINISH_WAIT_TIME_DEFAULT} from '../executor/MoveIBC';
import {execute} from "../graphql/gql-execute";
import gql from 'graphql-tag';

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
            diff: balances.diff(),
          }));
        }).catch(err => logger.error(err.message, chain === CHAIN.Secret ? chainInfo.rest : chainInfo.rpc));
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

  public getTokenAmount(chain: CHAIN, token: Token, isWrapped: boolean): Amount {
    return this.getTokenInfoInternal(this.balances[chain]?.tokenBalances, token, isWrapped)?.amount || BigNumber(0);
  }

  public getTokenInfoInternal<T extends {token: P, amount: P, denomInfo: K}, P extends string | BigNumber, K extends {decimals: number, isWrapped?: boolean}>(balances: T[], token: string, isWrapped: boolean): T | undefined {
    return _.find(balances, {token, denomInfo: {isWrapped}}) as any as T | undefined;
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
          balances: _(balanceUpdate.balances).map((val) => {
            let amount = convertCoinFromUDenomV2(val.amount, val.denomInfo.decimals).toFixed(val.denomInfo.decimals);
            let token = SwapTokenMap[val.token];
            if (val.denomInfo.isWrapped && (token === SwapToken.SCRT || getChainByChainId(val.denomInfo.chainId) !== CHAIN.Secret)) {
              return [`s${token}`, amount];
            } else {
              return [token, amount];
            }
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
        }).catch(err => {
          let message = err.message;
          try {
            message = JSON.parse(err.message.replace('Fetch error: ', '')).message;
          } catch {
          }
          this.logger.debugOnce('GQL', message);
        })
      })
    }
  }

  public async waitForChainBalanceUpdate(chain: CHAIN, token: SwapToken, {
    maxWaitTime = MAX_IBC_FINISH_WAIT_TIME_DEFAULT,
    isWrapped = false,
    isBalanceCheck = false,
  } = {}): Promise<Amount | false> {
    const swapToken = SwapTokenMap[token];
    const existingBalance = this.getTokenAmount(chain, SwapTokenMap[token], isWrapped);
    if (isBalanceCheck) {
      return existingBalance;
    }
    // TODO: for secret send a message to Monitor to keep looking
    //  only for a single token to avoid waiting too long and wait for that message
    return Promise.race([
      new Promise<false>(resolve => setTimeout(() => resolve(false), maxWaitTime)),
      new Promise<Amount>(resolve => {
        this.logger.log(`Waiting for ${isBalanceCheck ? 'balance' : 'transfer'} of ${token} to ${chain}...`.blue);
        const listener = (balanceUpdate: SerializedBalanceUpdate) => {
          const prop = isBalanceCheck ? 'balances' : 'diff';
          if (balanceUpdate.chain === chain && BigNumber(this.getTokenInfoInternal(balanceUpdate[prop] as SerializedBalances, swapToken,isWrapped)?.amount).isGreaterThan(0)) {
            this.events.removeListener('balance', listener);
            resolve(BigNumber(convertCoinFromUDenomV2(this.getTokenInfoInternal(balanceUpdate[prop] as SerializedBalances, swapToken, isWrapped)?.amount, this.getTokenInfoInternal(balanceUpdate[prop], swapToken, isWrapped)?.denomInfo.decimals)));
          }
          return false;
        };
        this.events.on('balance', listener);
      })]);
  }
}
