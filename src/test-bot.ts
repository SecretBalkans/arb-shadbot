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

const IS_TEST = 0;

colors.enable();

let logger;
ipc.config.appspace = 'shad';

ipc.config.silent = true;
ipc.config.logInColor = false; //default
ipc.config.logDepth = 1; //default

const monitorId = 'BalanceMonitor';
let worker;

function spawnWorker() {
  worker = cluster.fork();
  logger.log('Spawning bot process ...'.yellow);
  worker.on('error', (err) => {
    logger.log(`Worker ${worker.id} error`.red, err);
  });
  worker.on('listening', () => {
    logger.log(`Worker ${worker.id} online`.green);
  });
  worker.on('exit', () => {
    logger.log(`Worker ${worker.id} died.`.red);
    worker.destroy();
    worker = spawnWorker()();
  });
  return () => {
    return worker;
  };
}

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
    let prices, lastArbs: ArbV1WinRaw[];
    logger = new Logger('BalanceMonitor');
    ipc.config.logger = (msg) => logger.log(msg.gray);

    ipc.config.id = monitorId;
    ipc.config.retry = 1000;

    let botSocket;
    let loggerInitialBalanceUpdate = {};
    let initialBalances: Record<string, BalanceUpdate> = {};
    ipc.serve(
      function () {
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
            ipc.server.on('socket.disconnect', (socket, socketId) => {
              botSocket = null;
              loggerInitialBalanceUpdate = {};
              ipc.log(`client ${socketId} has disconnected`);
            });
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
      if (chain === CHAIN.Secret && !worker) {
        // Wait for Secret chain to update before spawning a worker.
        spawnWorker();
      }
      if (botSocket) {
        logger.log(`Balance ${chain} = ${balanceUpdate.diff.toString()}`.cyan);
      } else if (!loggerInitialBalanceUpdate[chain]) {
        loggerInitialBalanceUpdate[chain] = true;
        logger.log(`Balance ${chain} = ${balanceUpdate.balances.toString()}`.cyan);
      }
    }

    subscribeBalances(bot0Wallet)
      .subscribe(balanceUpdate => {
        logBalanceUpdate(balanceUpdate);
        if (botSocket) {
          ipc.server.emit(
            botSocket,
            'balance', balanceUpdate.toJSON());
        } else {
          initialBalances[balanceUpdate.chain] = initialBalances[balanceUpdate.chain] || balanceUpdate;
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
    balanceMonitor.enableLocalDBUpdates();

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
      },
    );

    async function test() {
      const mover = new MoveIBC(balanceMonitor);
      let moveQ = await mover.createMoveIbcPlan({
        amount: 'max',
        fromChain: CHAIN.Injective,
        toChain: CHAIN.Osmosis,
        token: SwapToken.INJ,
        amountMin: BigNumber.min(0.30)
      })
      let moveQ2 = await mover.createMoveIbcPlan({
        amount: BigNumber(15),
        fromChain: CHAIN.Osmosis,
        toChain: CHAIN.Secret,
        token: SwapToken.INJ,
        amountMin: BigNumber.min(0.30)
      })
      if (!moveQ || !moveQ2) {
        throw new Error('Nothing to test');
      }
      const mq = moveQ.concat(moveQ2);
      logger.log(mq.map(p => p.toString()));
      await Aigle.findSeries(mq, async op => {
        let result = await op.execute(bot0Wallet, balanceMonitor);
        if (!result.success) {
          // exit on first error
          logger.error(result.result);
          return false;
        }
      })
    }
  }

})().catch(err => console.log('Main error'.red, err));

