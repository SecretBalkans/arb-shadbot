import { Tendermint34Client } from '@cosmjs/tendermint-rpc';
import { Observable } from 'rxjs';
import { Logger } from '../utils';
const logger = new Logger('CosmosObserver');
let blockTime = 6000; // TODO: 1s for Injective

export default function cosmosObserver(rpcEndpoint: string, retryTime = 1000): Observable<number> {
  return new Observable(observer => {
    (async () => {
      let t34Client;
      try {
        t34Client = await Tendermint34Client.connect(rpcEndpoint);

      } catch (err){
        const message = `t34.connect / ${err.message} / ${rpcEndpoint}`;
        logger.debugOnce(message)
        observer.error(new Error(message))
        return;
      }
      let prevHeight;
      // noinspection InfiniteLoopJS
      do {
        let lastBlock;
        do {
          try {
            lastBlock = (await t34Client.block()) || lastBlock;
          } catch(err) {
            const message = `t34.block / ${err.message} / ${rpcEndpoint}`;
            logger.debugOnce(message);
          }
          if (lastBlock && (!prevHeight || prevHeight < lastBlock.block.header.height)) {
            prevHeight = lastBlock.block.header.height;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, retryTime));
        } while (true);
        observer.next(prevHeight);
        await new Promise(resolve => setTimeout(resolve, blockTime - retryTime));
      } while (true);
    })().catch((err) => observer.error(err));
  });
}
