# arb-shadbot
**The bot client executing arbs <br/> <br/>**
<span class="right">
  <img height="150" src="https://github.com/SecretBalkans/shadbot_client/blob/main/public/shadbot.png">
</span>
## Introduction
ShadBot provides the tools to monitor and operate alpha earning strategies on top of Shade protocol. Its vision is to become a community driven hedge fund that operates in the cross-chain ecosystem.
For the hackSecret we build the initial version of the product (Phase 1). The goal is to create a community of power users (people who know how to utilize different financial products on the blockchain). Power users can run the bot locally and use their own funds to trade and make profits.
Arbitrage opportunities that ShadBot supports are:
- Dex arbitrage
- Liquidation arbitrage (tbd)
- Staking derivative arbitrage (tbd)

## Problem
“Shade protocol enables alpha bringing strategies, but it lacks the proper tools to monitor and execute them.” <br/>
More on this in the [pitch deck](https://www.canva.com/design/DAFizPIwA98/jj4Z42WymYcH_-xhEuLG5Q/view?utm_content=DAFizPIwA98&utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink)

## Solution
ShadBot brings the infrastructure for monitoring and execution of different strategies. The final version will implement smart contract vaults which allow permissionless hedge funding. The governance model will also be introduced, which will provide more robustness and trust in the protocol.

## Architecture

> Go to bottom of this README for installation instructions

### Arb Monitor
Its goal is to observe the blockchain and capture different arbitrage opportunities. <br/>
For further info checkout [monitor](https://github.com/SecretBalkans/arb.js.git)
### Execution bot
Executes the arbitrage opportunities captured by the monitor and makes profit. <br/>
The code for the bot is [here](https://github.com/SecretBalkans/arb-shadbot)
### Hasura + Postgres service
Enables for the easy and fast retrieval of the data, which is queried from the dashboard. Monitor stores the arbitrage opportunities, execution routes in the database. Bot will store the execution logs. <br/>
For more info checkout [localHasura](https://github.com/SecretBalkans/localHasura).
### Dashboard
Front-end web app that gives an insight in the bot operation and funds held by the bot. It provides a functionality to manage the bot. <br/>
To see the code checkout [Dashboard](https://github.com/SecretBalkans/shadbot_client)
### Dockerized local network
We also created simple testing environment consisting of:
- Hermes relayer
- Local Osmosis node
- Pulsar2 Network (Secret Testnet)

The code can be found [here](https://github.com/SecretBalkans/tokentransfer)

## Tech Stack
We build mostly everything in typescript. We utilized libraries from Cosmos foundation for the chain interaction. Blockchain of interest is the Secret Network. For the hackathon and the first version of the protocol we built around Shade protocol. We also used docker to containerize software.

## Resources
- [Demo video](https://youtu.be/mL3C7FiJki4) 
- [Pitch deck](https://www.canva.com/design/DAFizPIwA98/jj4Z42WymYcH_-xhEuLG5Q/view?utm_content=DAFizPIwA98&utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink)

# Installation

Tested with: `node v16.17.0` 

The main thing you need to do before you run the `test-bot` is to create your own `.secrets.js`.

To easiest way is to use the provided template of `.secrets.js.example`. 

1. Copy + Paste `.secrets.js.example` and rename it to `.secrets.js`.

2. '.secrets.js' is included in `.gitignore` and should never be committed.

3. You need to input your secrets in that file now:
   1. First input one of `privateHex` OR `mnemonic`. Mnemonic can be base64 encoded so it is not in plain text on your computer. Only one is needed. They will be used to generate and operate on the wallets in the supported chains and they should hold tokens if arb is to be executed.
   2. You need to go ahead and generate some entropy for a secret api key.
   3. This can be done by copying an existing viewing key from Keplr let's say or you can generate one yourself by calling some SecretNetwork token contract. An example on how to do that is given in the `.secrets.js.example` file

``
!IMPORTANT! The bot will first spend some SCRT tokens (less than 1) to set it's viewing key (the one you've put in the .secrets.js) in order to start monitoring the Secret balances.
``


# How to run?
1. Run dockerized hasura + postgres
2. Start the dashboard
3. Start the arb monitor
4. Start the bot via `test-bot.ts`. Check out the code to see what it does and run it.

Description on how to run each can be found it the appropriate repo.
