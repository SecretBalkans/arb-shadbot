import {CHAIN, getTokenDenomInfo} from "../ibc";
import {BalanceUpdate, SerializedBalanceUpdate} from "./BalanceUpdate";
import {SwapTokenMap} from "../executor/types";
import _ from "lodash";
import BigNumber from "bignumber.js";
import {SerializedBalances, TokenBalanceWithDenomInfo} from "../wallet/ArbWallet";
import {convertCoinFromUDenomV2, convertCoinToUDenomV2} from "../executor/build-dex/utils";

export class BalanceMap {
  constructor(public readonly chain: CHAIN, public readonly tokenBalances: TokenBalanceWithDenomInfo[]) {
  }

  static fromSerializedBalanceUpdate(balanceUpdate: SerializedBalanceUpdate): BalanceMap {
    return new BalanceMap(balanceUpdate.chain, balanceUpdate.balances.map((balance) => {
      return {
        ...balance,
        token: SwapTokenMap[balance.token],
        amount: convertCoinFromUDenomV2(balance.amount, balance.denomInfo.decimals),
      };
    }))
  }


  toJSON(): SerializedBalances {
    return this.tokenBalances.map(({token, amount, denomInfo}) => ({
      denomInfo,
      amount: amount ? convertCoinToUDenomV2(amount, denomInfo.decimals).toString() : null,
      token: SwapTokenMap[token],
    }));
  }

  toString(): string {
    const tokenBalances = this.tokenBalances.filter(({amount}) => !amount.isEqualTo(0));
    return JSON.stringify(
      _.zipObject(
        tokenBalances.map(t => `${t.denomInfo.isWrapped ? 's' : ''}${t.token}`),
        tokenBalances.map(({amount}) => amount.toString()))
      , null, 4);
  }

  public diff(pastBalanceMap?: BalanceMap): BalanceMap {
    const newBalancesRaw = _.compact(_.map(this.tokenBalances, ({
                                                                  amount,
                                                                  token,
                                                                  denomInfo: {
                                                                    isWrapped,
                                                                    chainDenom
                                                                  },
                                                                }) => {
      const pastBalance = _.find(pastBalanceMap?.tokenBalances, {denomInfo: {isWrapped}, token});
      const diffAmount = pastBalance ? BigNumber(amount).minus(pastBalance.amount) : amount;
      return diffAmount.isZero() ? null : {
        chainDenom,
        isWrapped,
        token,
        amount: diffAmount,
      };
    }));
    _.forEach(pastBalanceMap?.tokenBalances, ({denomInfo: {chainDenom, isWrapped}, token, amount}) => {
      if (!_.find(this.tokenBalances, {token, denomInfo: {chainDenom, isWrapped}})) {
        // if we do not have the past denom, then add it with an - indicating it disappeared
        newBalancesRaw.push({chainDenom, token, amount: amount.multipliedBy(-1), isWrapped});
      } else {
        // do nothing as we have already subtracted amounts that we have
      }
    });

    return new BalanceMap(this.chain, newBalancesRaw.map(({amount, isWrapped, token}) => ({
      denomInfo: getTokenDenomInfo(SwapTokenMap[token], isWrapped),
      amount,
      token
    })));
  }


  updateBalanceMap(balanceUpdate: SerializedBalanceUpdate): BalanceUpdate {
    const balanceMap = BalanceMap.fromSerializedBalanceUpdate(balanceUpdate);
    const realBalanceUpdate = new BalanceUpdate({
      chain: balanceUpdate.chain,
      balances: balanceMap,
      diff: balanceMap.diff(this)
    })
    _.forEach(balanceUpdate.balances, ({token, denomInfo, amount}) => {
      const tokenInBalance = _.find(this.tokenBalances, {
        token,
        denomInfo: {isWrapped: denomInfo.isWrapped}
      }) as TokenBalanceWithDenomInfo;
      if (tokenInBalance) {
        tokenInBalance.amount = convertCoinFromUDenomV2(amount, denomInfo.decimals);
      } else {
        this.tokenBalances.push({
          denomInfo,
          token: SwapTokenMap[token],
          amount: convertCoinFromUDenomV2(amount, denomInfo.decimals)
        })
      }
    });
    _.forEach(this.tokenBalances, (currentBalance) => {
      const tokenInUpdate = _.find(balanceUpdate.balances, {
        token: currentBalance.token,
        denomInfo: {isWrapped: currentBalance.denomInfo.isWrapped}
      });
      if (!tokenInUpdate) {
        currentBalance.amount = new BigNumber(0);
      }
    });
    return realBalanceUpdate;
  }
}
