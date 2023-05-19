import {
  ChainRestAuthApi,
  Address,
  createTransaction,
  DEFAULT_STD_FEE,
  PrivateKey,
  TxGrpcClient,
  TxResponse,
} from '@injectivelabs/sdk-ts'
import {fromBase64} from "secretjsbeta";

export default class InjectiveClient {
  private restEndpoint: string;
  private readonly injectiveAddress: any;
  public readonly publicAddress: Address;
  private readonly chainId: string;
  private readonly pubKey: any;
  private privateKey: any;
  grpcEndpoint: string;

  constructor({mnemonic, privateHex}) {
    let privateKey;
    if (privateHex) {
      privateKey = PrivateKey.fromHex(privateHex);
    } else {
      let parsedMnemonic;
      try {
        parsedMnemonic = Buffer.from(fromBase64(mnemonic)).toString('utf-8');
      } catch {
      }
      privateKey = PrivateKey.fromMnemonic(parsedMnemonic);
    }
    this.injectiveAddress = privateKey.toBech32();
    this.publicAddress = privateKey.toAddress();
    this.pubKey = privateKey.toPublicKey().toBase64();
    this.privateKey = privateKey;
    this.chainId = 'injective-1'
    this.restEndpoint = 'https://lcd.injective.network'
    this.grpcEndpoint = 'https://grpc.injective.network'
  }

  async broadcastTransaction(messages): Promise<TxResponse> {
    const accountDetails = await new ChainRestAuthApi(this.restEndpoint).fetchAccount(
      this.injectiveAddress
    );
    const {signBytes, txRaw} = createTransaction({
      message: messages,
      fee: DEFAULT_STD_FEE,
      pubKey: this.pubKey,
      sequence: parseInt(accountDetails.account.base_account.sequence, 10),
      accountNumber: parseInt(
        accountDetails.account.base_account.account_number,
        10
      ),
      chainId: this.chainId,
    });
    /** Sign transaction */
    const signature = await this.privateKey.sign(Buffer.from(signBytes));
    /** Append Signatures */
    txRaw.signatures = [signature];
    const txService = new TxGrpcClient(this.grpcEndpoint);
    const txResponse = await txService.broadcast(txRaw);
    return txResponse;
  }
}
