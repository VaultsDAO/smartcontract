import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-etherscan";
import * as dotenv from 'dotenv';
dotenv.config();

const INFURA_KEY = process.env.INFURA_KEY ?? '';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? '';
const SNOWTRACE_API_KEY = process.env.SNOWTRACE_API_KEY ?? '';
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY ?? '';
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? '';
const BORROWER_PRIVATE_KEY = process.env.BORROWER_PRIVATE_KEY ?? '';
const LENDER_PRIVATE_KEY = process.env.LENDER_PRIVATE_KEY ?? '';
const MY_LENDER_KEY = process.env.MY_LENDER_KEY ?? '';

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      goerli: ETHERSCAN_API_KEY,
      avalancheFujiTestnet: SNOWTRACE_API_KEY,
      arbitrumGoerli: ARBISCAN_API_KEY,

      // mainnet: "YOUR_ETHERSCAN_API_KEY",
      // ropsten: "YOUR_ETHERSCAN_API_KEY",
      // rinkeby: "YOUR_ETHERSCAN_API_KEY",
      // goerli: "YOUR_ETHERSCAN_API_KEY",
      // kovan: "YOUR_ETHERSCAN_API_KEY",
      // // binance smart chain
      // bsc: "YOUR_BSCSCAN_API_KEY",
      // bscTestnet: "YOUR_BSCSCAN_API_KEY",
      // // huobi eco chain
      // heco: "YOUR_HECOINFO_API_KEY",
      // hecoTestnet: "YOUR_HECOINFO_API_KEY",
      // // fantom mainnet
      // opera: "YOUR_FTMSCAN_API_KEY",
      // ftmTestnet: "YOUR_FTMSCAN_API_KEY",
      // // optimism
      // optimisticEthereum: "YOUR_OPTIMISTIC_ETHERSCAN_API_KEY",
      // optimisticKovan: "YOUR_OPTIMISTIC_ETHERSCAN_API_KEY",
      // // polygon
      // polygon: "YOUR_POLYGONSCAN_API_KEY",
      // polygonMumbai: "YOUR_POLYGONSCAN_API_KEY",
      // // arbitrum
      // arbitrumOne: "YOUR_ARBISCAN_API_KEY",
      // arbitrumTestnet: "YOUR_ARBISCAN_API_KEY",
      // // avalanche
      // avalanche: "YOUR_SNOWTRACE_API_KEY",
      // avalancheFujiTestnet: "YOUR_SNOWTRACE_API_KEY",
      // // moonbeam
      // moonbeam: "YOUR_MOONBEAM_MOONSCAN_API_KEY"
      //   moonriver: "YOUR_MOONRIVER_MOONSCAN_API_KEY",
      // moonbaseAlpha: "YOUR_MOONBEAM_MOONSCAN_API_KEY",
      // // harmony
      // harmony: "YOUR_HARMONY_API_KEY",
      // harmonyTest: "YOUR_HARMONY_API_KEY",
      // // xdai and sokol don't need an API key, but you still need
      // // to specify one; any string placeholder will work
      // xdai: "api-key",
      // sokol: "api-key",
      // aurora: "api-key",
      // auroraTestnet: "api-key",

    },
    // customChains: [
    //   {
    //     network: "fuji",
    //     chainId: 43113,
    //     urls: {
    //       apiURL: "https://api-testnet.snowtrace.io/api",
    //       browserURL: "https://testnet.snowtrace.io/"
    //     }
    //   }
    // ],
  },
  networks: {
    local: {
      url: "http://127.0.0.1:8545",
      gas: 8000000,
    },
    goerli: {
      url: "https://goerli.infura.io/v3/" + INFURA_KEY,
      chainId: 5,
      gas: 8000000,
      accounts: [PRIVATE_KEY],
    },
    fuji: {
      url: "https://avalanche-fuji.infura.io/v3/" + INFURA_KEY,
      chainId: 43113,
      gas: 8000000,
      accounts: [PRIVATE_KEY],
    },
    arbitrumTestnet: {
      url: "https://arbitrum-goerli.infura.io/v3/" + INFURA_KEY,
      chainId: 421613,
      gas: 8000000,
      accounts: [PRIVATE_KEY],
    },
  },
};

export default config;
