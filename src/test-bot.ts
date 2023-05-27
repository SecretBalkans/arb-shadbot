import {BalanceMonitor, BalanceUpdate, SerializedBalanceUpdate, subscribeBalances} from './balances/BalanceMonitor';
import {CHAIN, SUPPORTED_CHAINS} from './ibc';
import {Logger} from './utils';
import ipc from 'node-ipc';
import colors from '@colors/colors';
import cluster from 'cluster';
import {Prices, subscribePrices} from './prices/prices';
import {ArbWallet} from './wallet/ArbWallet';
import {subscribeLiveArb} from './monitorGqlClient';
import ArbBuilder from './executor/ArbBuilder';
import config from './config';
import MoveIBC from "./executor/MoveIBC";
import BigNumber from "bignumber.js";
import Aigle from "aigle";
import {SwapToken} from "./executor/build-dex/dex/types/dex-types";
import {ArbV1WinRaw} from "./executor/types";
import {subscribeBotStatus, updateBotReportedStatus, updateSupervisorReportedTs} from "./graphql/gql-execute";

const IS_TEST = 0;

colors.enable();

let logger;
ipc.config.appspace = 'shad';

ipc.config.silent = true;
ipc.config.logInColor = false; //default
ipc.config.logDepth = 1; //default

const monitorId = 'BalanceMonitor';
const botID = 'dea2ae0b-9909-4c79-8e31-a9376957c3f6';

const bot0Wallet = new ArbWallet({
  mnemonic: config.secrets.cosmos.mnemonic,
  privateHex: config.secrets.cosmos.privateHex,
  secretNetworkViewingKey: config.secrets.secret.apiKey,
}, SUPPORTED_CHAINS);

(async () => {
  try {
    await bot0Wallet.initShadeRegistry();
    await bot0Wallet.initIBCInfoCache();
  } catch (err) {
    console.log('Init error'.red, err);
    return;
  }

  if (cluster.isPrimary) {

    let worker, initialBalanceWaitBotSpawn;
    let botSocket;
    let loggerInitialBalanceUpdate = {};
    let initialBalances: Record<string, BalanceUpdate> = {};
    function spawnWorker() {
      worker = cluster.fork();
      updateBotReportedStatus(botID, `Starting...`);
      logger.log('Spawning bot process ...'.yellow);
      worker.on('error', (err) => {
        updateBotReportedStatus(botID, `Errored`);
        logger.log(`Worker error`.red, err);
      });
      worker.on('exit', () => {
        updateBotReportedStatus(botID, `Stopped`);
        logger.log(`Worker died.`.red);
        worker?.destroy();
        botSocket = null;
        loggerInitialBalanceUpdate = {};
        worker = null;
      });
      return () => {
        return worker;
      };
    }

    setInterval(() => {
      updateSupervisorReportedTs(botID)
    }, 5000);
    updateSupervisorReportedTs(botID).catch(err => logger.log(err));
    let botTargetStatus;
    subscribeBotStatus(botID).subscribe((bot) => {
      botTargetStatus = bot.status;
      if (botTargetStatus === false && worker) {
        logger.log('Stopping worker...')
        worker?.destroy()
        worker = null;
      }
      if (botTargetStatus === true && !worker && !initialBalanceWaitBotSpawn) {
        spawnWorker();
      }
    })
    let prices, lastArbs: ArbV1WinRaw[];
    logger = new Logger('BalanceMonitor');
    ipc.config.logger = (msg) => logger.log(msg.gray);
    const balanceMonitor = new BalanceMonitor();
    balanceMonitor.enableLocalDBUpdates();

    ipc.config.id = monitorId;
    ipc.config.retry = 1000;
    ipc.serve(
      function () {
        ipc.server.on('online', (e, _socket) => {
          logger.log(e);
          updateBotReportedStatus(botID, `Online`);
        })
        ipc.server.on(
          'connect',
          function (socket) {
            botSocket = socket;
            Object.values(initialBalances).forEach((b: BalanceUpdate) => {
              ipc.server.emit(
                botSocket,
                'balance', b.toJSON());
            });
            ipc.server.emit(
              botSocket,
              'prices', prices);
            ipc.server.emit(
              botSocket,
              'arbs', lastArbs);
          },
        );
      },
    );
    ipc.server.start();

    subscribeLiveArb().subscribe((arbs) => {
      lastArbs = arbs;
      if (botSocket) {
        ipc.server.emit(
          botSocket,
          'arbs', lastArbs);
      }
    });

    function logBalanceUpdate(balanceUpdate: BalanceUpdate) {
      const chain = balanceUpdate.chain;
      if (chain === CHAIN.Secret && !worker && !initialBalanceWaitBotSpawn && botTargetStatus) {
        // Wait for Secret chain to update before spawning a worker.
        initialBalanceWaitBotSpawn = true;
        spawnWorker();
      }
      if (!loggerInitialBalanceUpdate[chain]) {
        loggerInitialBalanceUpdate[chain] = true;
        logger.log(`Balance (init) ${chain} = ${balanceUpdate.balances.toString()}`.cyan);
      } else {
        logger.log(`Balance (+/-) ${chain} = ${balanceUpdate.diff.toString()}`.cyan);
      }
    }

    subscribeBalances(bot0Wallet)
      .subscribe(balanceUpdate => {
        const trueBalanceUpdate = balanceMonitor.updateBalances(balanceUpdate.toJSON());
        logBalanceUpdate(trueBalanceUpdate);
        initialBalances[balanceUpdate.chain] = balanceUpdate;
        if (botSocket) {
          ipc.server.emit(
            botSocket,
            'balance', trueBalanceUpdate.toJSON());
        }
      }, err => logger.error(err));

    const pricesObs = await subscribePrices();
    pricesObs.subscribe(pr => {
      prices = pr;
      if (botSocket) {
        ipc.server.emit(
          botSocket,
          'prices', prices);
      }
    });
  } else {
    const workerId = cluster.worker.id;
    ipc.config.id = `Bot${workerId}`;
    ipc.config.retry = 1000;
    logger = new Logger(`Bot#${workerId}`);
    ipc.config.logger = (msg) => logger.log(msg.gray);
    logger.log(`Started. Will connect to #${monitorId}.`);
    const balanceMonitor = new BalanceMonitor();
    const arbBuilder = new ArbBuilder(bot0Wallet, balanceMonitor);

    ipc.connectTo(
      monitorId,
      function () {
        IS_TEST && setTimeout(() => {
          test().catch(err => {
            logger.error(err);
            debugger;
          });
        }, 100);
        ipc.of[monitorId].on(
          'balance',
          function (data: SerializedBalanceUpdate) {
            balanceMonitor.updateBalances(data);
          },
        );
        ipc.of[monitorId].on(
          'prices',
          function (data: Prices) {
            arbBuilder.updatePrices(data);
          },
        );
        ipc.of[monitorId].on(
          'arbs',
          function (data: ArbV1WinRaw[]) {
            !IS_TEST && arbBuilder.updateArbs(data);
          });
        ipc.of[monitorId].emit('online', {online: true});
      },
    );

    async function test() {
      const mover = new MoveIBC(balanceMonitor);
      let moveQ = await mover.createMoveIbcPlan({
        amount: 'max',
        fromChain: CHAIN.Axelar,
        toChain: CHAIN.Osmosis,
        token: SwapToken.USDC,
        amountMin: BigNumber.min(0)
      })
      let moveQ2 = [] || await mover.createMoveIbcPlan({
        amount: 'max',
        fromChain: CHAIN.Osmosis,
        toChain: CHAIN.Secret,
        token: SwapToken.stkATOM,
        amountMin: BigNumber.min(0)
      })
      let moveQ3 = [] || await mover.createMoveIbcPlan({
        amount: 'max',
        fromChain: CHAIN.Axelar,
        toChain: CHAIN.Secret,
        token: SwapToken.USDC,
        amountMin: BigNumber.min(0)
      })
      if (!moveQ || !moveQ2 || !moveQ3) {
        throw new Error('Nothing to test');
      }
      const mq = moveQ.concat(moveQ2).concat(moveQ3);
      logger.log(mq.map(p => p.toString()));
      await Aigle.findSeries(mq, async op => {
        let result = await op.execute(bot0Wallet, balanceMonitor);
        if (!result.success) {
          logger.error(result.result);
          // exit on first error
          return true;
        }
      })
    }
  }

})().catch(err => console.log('Main error'.red, err));

