/**
 * Use this file to configure your truffle project. It's seeded with some
 * common settings for different networks and features like migrations,
 * compilation and testing. Uncomment the ones you need or modify
 * them to suit your project as necessary.
 *
 * More information about configuration can be found at:
 *
 * trufflesuite.com/docs/advanced/configuration
 *
 * To deploy via Infura you'll need a wallet provider (like @truffle/hdwallet-provider)
 * to sign your transactions before they're sent to a remote public node. Infura accounts
 * are available for free at: infura.io/register.
 *
 * You'll also need a mnemonic - the twelve word phrase the wallet uses to generate
 * public/private key pairs. If you're publishing your code to GitHub make sure you load this
 * phrase from a file you've .gitignored so it doesn't accidentally become public.
 *
 */

// const HDWalletProvider = require('@truffle/hdwallet-provider');
//
// const fs = require('fs');
// const mnemonic = fs.readFileSync(".secret").toString().trim();

require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {

  plugins: ['truffle-plugin-verify'],

  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
    snowtrace: process.env.SNOWTRACE_API_KEY
  },

  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a development blockchain for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache-cli, geth or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.
    //

    local: {
      host: "127.0.0.1",     // Localhost (default: none)
      port: 8545,            // Standard Ethereum port (default: none)
      gas: "6721975",
      network_id: "*",       // Any network (default: none)
      migration: true,
    },


    development: {
      host: "127.0.0.1",     // Localhost (default: none)
      port: 8545,            // Standard Ethereum port (default: none)
      gas: "6721975",
      network_id: "*",       // Any network (default: none)
      migration: false
    },

    goerli: {
      provider: function () {
        return new HDWalletProvider([process.env.PRIVATE_KEY, process.env.PRICE_ADMIN_KEY], "https://goerli.infura.io/v3/" + process.env.INFURA_KEY);
        // return new HDWalletProvider([process.env.PRIVATE_KEY, process.env.PRICE_ADMIN_KEY], "https://eth-goerli.g.alchemy.com/v2/" + process.env.ALCHEMY_KEY);
      },
      network_id: "5",       // Any network (default: none)
      gas: 8000000,
      // gasPrice: 3 * (10 ** 9),
      migration: true,
    },

    mainnet: {
      provider: function () {
        return new HDWalletProvider([process.env.PRIVATE_KEY, process.env.PRICE_ADMIN_KEY], "https://mainnet.infura.io/v3/" + process.env.INFURA_KEY);
      },
      network_id: "1",       // Any network (default: none)
      gas: 8000000,
      // gasPrice: 3 * (10 ** 9),
      migration: true,
    },

    fuji: {
      provider: function () {
        return new HDWalletProvider([process.env.PRIVATE_KEY, process.env.PRICE_ADMIN_KEY, process.env.LENDER_PRIVATE_KEY, process.env.BORROWER_PRIVATE_KEY], "https://avalanche-fuji.infura.io/v3/" + process.env.INFURA_KEY);
      },
      network_id: "43113",       // Any network (default: none)
      gas: 8000000,
      // gasPrice: 3 * (10 ** 9),
      migration: true,
    },

    bsc_testnet: {
      provider: function () {
        return new HDWalletProvider([process.env.PRIVATE_KEY, process.env.PRICE_ADMIN_KEY, process.env.LENDER_PRIVATE_KEY, process.env.BORROWER_PRIVATE_KEY], "https://data-seed-prebsc-1-s1.binance.org:8545");
      },
      network_id: "*",       // Any network (default: none)
      // gas: 8000000,
      // gasPrice: 3 * (10 ** 9),
      migration: true,
    },

    mumbai: {
      provider: function () {
        return new HDWalletProvider([process.env.PRIVATE_KEY, process.env.PRICE_ADMIN_KEY, process.env.LENDER_PRIVATE_KEY, process.env.BORROWER_PRIVATE_KEY], "https://rpc-mumbai.maticvigil.com/v1/" + process.env.MATIC_KEY);
      },
      network_id: "*",       // Any network (default: none)
      gas: 8000000,
      // gasPrice: 3 * (10 ** 9),
      migration: true,
    },
    mumbai_test: {
      provider: function () {
        return new HDWalletProvider([process.env.ACCOUNT0, process.env.ACCOUNT1, process.env.ACCOUNT2, process.env.ACCOUNT3, process.env.ACCOUNT4, process.env.ACCOUNT5, process.env.ACCOUNT6, process.env.ACCOUNT7, process.env.ACCOUNT8, process.env.ACCOUNT9, process.env.ACCOUNT10], "https://polygon-testnet.public.blastapi.io/");
      },
      network_id: "*",       // Any network (default: none)
      gas: 21000,
      // gasPrice: 3 * (10 ** 9),
      migration: true,
    },

    // Another network with more advanced options...
    // advanced: {
    // port: 8777,             // Custom port
    // network_id: 1342,       // Custom network
    // gas: 8500000,           // Gas sent with each transaction (default: ~6700000)
    // gasPrice: 20000000000,  // 20 gwei (in wei) (default: 100 gwei)
    // from: <address>,        // Account to send txs from (default: accounts[0])
    // websocket: true        // Enable EventEmitter interface for web3 (default: false)
    // },
    // Useful for deploying to a public network.
    // NB: It's important to wrap the provider as a function.
    // ropsten: {
    // provider: () => new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/YOUR-PROJECT-ID`),
    // network_id: 3,       // Ropsten's id
    // gas: 5500000,        // Ropsten has a lower block limit than mainnet
    // confirmations: 2,    // # of confs to wait between deployments. (default: 0)
    // timeoutBlocks: 200,  // # of blocks before a deployment times out  (minimum/default: 50)
    // skipDryRun: true     // Skip dry run before migrations? (default: false for public nets )
    // },
    // Useful for private networks
    // private: {
    // provider: () => new HDWalletProvider(mnemonic, `https://network.io`),
    // network_id: 2111,   // This network is yours, in the cloud.
    // production: true    // Treats this network as if it was a public net. (default: false)
    // }
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.10",    // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {          // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 1000
        },
        evmVersion: "istanbul"
      }
    }
  },

  // Truffle DB is currently disabled by default; to enable it, change enabled:
  // false to enabled: true. The default storage location can also be
  // overridden by specifying the adapter settings, as shown in the commented code below.
  //
  // NOTE: It is not possible to migrate your contracts to truffle DB and you should
  // make a backup of your artifacts to a safe location before enabling this feature.
  //
  // After you backed up your artifacts you can utilize db by running migrate as follows: 
  // $ truffle migrate --reset --compile-all
  //
  // db: {
  // enabled: false,
  // host: "127.0.0.1",
  // adapter: {
  //   name: "sqlite",
  //   settings: {
  //     directory: ".db"
  //   }
  // }
  // }
};
