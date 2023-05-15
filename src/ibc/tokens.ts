import { Logger } from '../utils';
import { ChainInfos } from './osmosis-registry/chainInfos';
import { IBCAsset, OsmoIBCAssetInfos } from './osmosis-registry/ibcAssets';
import _ from 'lodash';
import { Denom, NoIBCToken, NonArbedToken, SwapToken, SwapTokenMap, Token } from './dexTypes';
import { makeIBCMinimalDenom } from '../utils/denoms';

const logger = new Logger('Tokens');

const osmoIbcDenomsAndRawToCoinInfo: Record<Denom, { chainId: string, token: Token | NonArbedToken }> = {};
export type DenomInfo = { chainId: string, chainDenom: Denom, decimals: number, token: Token | NonArbedToken };
export type BaseDenomInfo = { chainId: string, baseDenom: Denom, decimals: number };
const tokenToBaseDenomInfo: Record<Token | NonArbedToken, BaseDenomInfo> = {};

ChainInfos.forEach(chInfo => {
  chInfo.currencies.forEach(curr => {
    const parsedCoinDenom = curr.coinDenom.replace('-', '');
    if (parsedCoinDenom === 'OSMO') {
      tokenToBaseDenomInfo[SwapToken.OSMO] = {
        chainId: chInfo.chainId,
        decimals: curr.coinDecimals
      }
      osmoIbcDenomsAndRawToCoinInfo[curr.coinMinimalDenom] = {
        chainId: chInfo.chainId,
        token: SwapToken.OSMO,
      };
      return;
    }

    const osmoIbcInfo: IBCAsset = _.find(OsmoIBCAssetInfos, {
      counterpartyChainId: chInfo.chainId,
      coinMinimalDenom: curr.coinMinimalDenom.includes(':') ? curr.coinMinimalDenom.split(':').slice(0, 2).join(':') : curr.coinMinimalDenom,
    });
    if (!osmoIbcInfo) {
      tokenToBaseDenomInfo[curr.coinDenom as NoIBCToken] = {
        chainId: chInfo.chainId,
        decimals: curr.coinDecimals
      }
      osmoIbcDenomsAndRawToCoinInfo[curr.coinMinimalDenom] = {
        chainId: chInfo.chainId,
        token: curr.coinDenom as NoIBCToken,
      };
      return osmoIbcDenomsAndRawToCoinInfo[curr.coinMinimalDenom] = {
        chainId: chInfo.chainId,
        token: curr.coinDenom as NoIBCToken,
      };
    }
    const osmoIbcMinimalDenom = makeIBCMinimalDenom(osmoIbcInfo.sourceChannelId, osmoIbcInfo.coinMinimalDenom);
    const swapToken = SwapToken[parsedCoinDenom];
    if (!swapToken) {
      tokenToBaseDenomInfo[curr.coinMinimalDenom as NonArbedToken] = {
        chainId: chInfo.chainId,
        decimals: curr.coinDecimals,
        baseDenom: curr.coinMinimalDenom as Denom,
      }
      osmoIbcDenomsAndRawToCoinInfo[osmoIbcInfo.coinMinimalDenom] = {
        chainId: chInfo.chainId,
        token: curr.coinMinimalDenom as NonArbedToken,
      };
      return osmoIbcDenomsAndRawToCoinInfo[osmoIbcMinimalDenom] = {
        chainId: chInfo.chainId,
        token: curr.coinMinimalDenom as NonArbedToken,
        denom: curr,
      };
    } else {
      const swapTokenParsed: Token = SwapTokenMap[swapToken];
      if (!swapTokenParsed) {
        logger.debugOnce(`No swap token for denom=${parsedCoinDenom} on chain=${chInfo.chainId}/${chInfo.chainName}`);
      }
      if (typeof chInfo.chainId !== 'string') {
        logger.debugOnce(`No chainId for denom=${parsedCoinDenom} on chain=${chInfo.chainName}`);
      }
      tokenToBaseDenomInfo[swapTokenParsed] = {
        decimals: curr.coinDecimals,
        chainId: chInfo.chainId,
        baseDenom: curr.coinMinimalDenom as Denom,
      }
      osmoIbcDenomsAndRawToCoinInfo[osmoIbcInfo.coinMinimalDenom] = {
        chainId: chInfo.chainId,
        token: swapTokenParsed,
      };
      return osmoIbcDenomsAndRawToCoinInfo[osmoIbcMinimalDenom] = {
        chainId: chInfo.chainId,
        token: swapTokenParsed,
      };
    }
  });
});
/*
export function denomsToTokenId(denom: Denom, chainId?: string): Token | NonArbedToken {
  if (osmoIbcDenomsAndRawToCoinInfo[denom]) {
    return osmoIbcDenomsAndRawToCoinInfo[denom].token;
  } else {
    // Do not log osmo gamm pool tokens
    if(denom.startsWith('ibc')) {
      logger.debugOnce(`Not mapped ${chainId ? `(chain=${chainId}) `: ''}(denom=${denom})`);
      return;
    }
  }
}*/

export function getTokenBaseDenomInfo(token: Token | NonArbedToken): BaseDenomInfo {
  const info = tokenToBaseDenomInfo[token];
  if(!info) {
    throw new Error(`${token} denom/decimals info not found`)
  }
  return {
    ...info
  };
}
/*
export function getNativeChainDenom(chain: CHAIN, asset: SwapToken): string {
  const nativeTokenInfo = getTokenDenomInfo(SwapTokenMap[asset]);
  if (getChainInfo(chain).chainId === nativeTokenInfo.chainId) {
    return nativeTokenInfo.denom;
  }

  throw new Error(`Unsupported token ${asset} on ${chain}`);
}
*/
