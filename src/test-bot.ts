import {BalanceMonitor, BalanceUpdate, SerializedBalanceUpdate, subscribeBalances} from './balances/BalanceMonitor';
import {CHAIN, SUPPORTED_CHAINS} from './ibc';
import {Logger} from './utils';
import ipc from 'node-ipc';
import colors from '@colors/colors';
import cluster from 'cluster';
import {Prices, subscribePrices} from './prices/prices';
import {ArbWallet} from './wallet/ArbWallet';
import {ArbV1Raw, parseRawArbV1, subscribeLiveArb, toRawArbV1} from './monitorGqlClient';
import ArbBuilder from './executor/ArbBuilder';
import config from './config';
import {SwapToken} from "./ibc/dexTypes";

colors.enable();

let logger;
ipc.config.appspace = 'shad';

ipc.config.silent = true;
ipc.config.logInColor = false; //default
ipc.config.logDepth = 1; //default

const monitorId = 'BalanceMonitor';

function spawnWorker() {
  let worker = cluster.fork();
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
    await bot0Wallet.initSecretRegistry();
    await bot0Wallet.initIBCInfoCache();
  } catch (err) {
    console.log('Init error'.red, err);
    return;
  }

  if (cluster.isPrimary) {
    let prices, lastArbs;
    logger = new Logger('BalanceMonitor');
    ipc.config.logger = (msg) => logger.log(msg.gray);

    ipc.config.id = monitorId;
    ipc.config.retry = 1000;
    const workerGetter = spawnWorker();
    let botSocket;
    let loggerInitialBalanceUpdate = {};
    let initialBalances: Record<string, BalanceUpdate> = {};
    ipc.serve(
      function() {
        ipc.server.on(
          'connect',
          function(socket) {
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
      lastArbs = arbs.map(toRawArbV1);
      if (botSocket) {
        ipc.server.emit(
          botSocket,
          'arbs', lastArbs);
      }
    });

    function logBalanceUpdate(balanceUpdate: BalanceUpdate) {
      const chain = balanceUpdate.chain;
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
    logger.log(`Started. Will connect to ${monitorId}.`);
    const balanceMonitor = new BalanceMonitor();
    const executor = new ArbBuilder(bot0Wallet, balanceMonitor);
    balanceMonitor.enableLocalDBUpdates();
    // HACK: delay some time to wait for secret funds to be resolved
    await new Promise(resolve => setTimeout(resolve, 15000));
    ipc.connectTo(
      monitorId,
      function() {
        setTimeout(() => {
          test().catch(err => {
            logger.error(err);
            debugger;
          });
        }, 1000);
        ipc.of[monitorId].on(
          'balance',
          function(data: SerializedBalanceUpdate) {
            balanceMonitor.updateBalances(data);
          },
        );
        ipc.of[monitorId].on(
          'prices',
          function(data: Prices) {
            executor.updatePrices(data);
          },
        );
        ipc.of[monitorId].on(
          'arbs',
          function(data: ArbV1Raw[]) {
           executor.updateArbs(data.map(parseRawArbV1));
          });
      },
    );

    async function test() {
      // const mover = new MoveIBC(bot0Wallet, balanceMonitor);
      // await mover.moveIBC(CHAIN.Stride, CHAIN.Osmosis, SwapToken.stJUNO, 'max');
      // await mover.moveIBC(CHAIN.Osmosis, CHAIN.Secret, SwapToken.stJUNO, 'max', { waitAppear: true});
    }
  }

})().catch(err => console.log('Main error'.red, err));

