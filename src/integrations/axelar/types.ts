import { SourceChain } from "../bridge-info";

export type SourceChainTokenConfig = {
  /** Source Chain identifier. */
  id: SourceChain;

  /** Address of origin ERC20 token for that origin chain. Leave blank to
   *  prefer native ETH currency if `id` is not a Cosmos chain in `ChainInfo`.
   */
  erc20ContractAddress?: string;

  /** For IBC transfer from CosmosCounterparty<->via Axelar<->Osmosis */
  ibcConfig?: {
    /** on cosmos counterparty */
    sourceChannelId: string;
    /** on Axelar */
    destChannelId: string;
  };

  logoUrl: string;

  /** If this **EVM** token is auto-wrappable by Axelar, specify the native token.
   *  The token on Osmosis is assumed to be the wrapped version of the native token, but labelled as the native token.
   *  Assume we're transferring native token, since it's the gas token as well and generally takes precedence.
   *
   *  i.e. ETH for WETH, BNB for WBNB, etc.
   *
   *  Specified per Axelar bridged token & network due to each token having a single source chain ERC20 instance.
   */
  nativeWrapEquivalent?: {
    /** Used as key for Axelar JS-SDK/APIs, only when *transfering TO* Osmosis (depositing).
     * See (unofficial): https://github.com/axelarnetwork/axelarjs-sdk/blob/302cb4673e0293b707d3401ad141be5e9cec2bbf/src/libs/types/index.ts#L122 */
    tokenMinDenom: string;
    /** Wrap denom (e.g. WETH), since it's assumed we're labeling Osmosis balance as native. */
    wrapDenom: string;
  };
};
