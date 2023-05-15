const path = require('path');
export default {
  secrets: require(path.join(__dirname,'../.secrets')) as {
    cosmos: { privateHex: string, mnemonic: string},
    secret: { apiKey: string},
    monitor: {
        gqlUrl: any;
        gqlPassword: string
    }
  }
};
