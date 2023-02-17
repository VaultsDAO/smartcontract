import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@openzeppelin/hardhat-upgrades"
import "@typechain/hardhat"
import "hardhat-contract-sizer"
import "hardhat-dependency-compiler"
import "hardhat-gas-reporter"
import { HardhatUserConfig } from "hardhat/config"
import "solidity-coverage"
import "./mocha-test"
import "@nomiclabs/hardhat-etherscan";
import * as dotenv from 'dotenv';
dotenv.config();

const INFURA_KEY = process.env.INFURA_KEY ?? '';
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY ?? '';
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? '';
const MAKER_ADMIN_KEY = process.env.MAKER_ADMIN_KEY ?? '';
const PRICE_ADMIN_KEY = process.env.PRICE_ADMIN_KEY ?? '';
const PLATFROM_ADMIN_KEY = process.env.PLATFROM_ADMIN_KEY ?? '';
const TRADER1_KEY = process.env.TRADER1_KEY ?? '';
const TRADER2_KEY = process.env.TRADER2_KEY ?? '';
const TRADER3_KEY = process.env.TRADER3_KEY ?? '';
const TRADER4_KEY = process.env.TRADER4_KEY ?? '';
const MINER_KEY = process.env.MINER_KEY ?? '';


const config: HardhatUserConfig = {
    solidity: {
        version: "0.7.6",
        settings: {
            optimizer: { enabled: true, runs: 100 },
            evmVersion: "berlin",
            // for smock to mock contracts
            outputSelection: {
                "*": {
                    "*": ["storageLayout"],
                },
            },
        },
    },
    etherscan: {
        apiKey: {
            arbitrumGoerli: ARBISCAN_API_KEY,
        },
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
        },
        local: {
            url: "http://127.0.0.1:8545",
        },
        mainnet: {
            url: "https://mainnet.infura.io/v3/" + INFURA_KEY,
            chainId: 1,
            gas: 8000000,
            accounts: [PRIVATE_KEY, MAKER_ADMIN_KEY, PRICE_ADMIN_KEY],
        },
        arbitrumDev: {
            url: "https://arbitrum-goerli.infura.io/v3/" + INFURA_KEY,
            chainId: 421613,
            gas: 8000000,
            accounts: [PRIVATE_KEY, MAKER_ADMIN_KEY, PRICE_ADMIN_KEY, PLATFROM_ADMIN_KEY, TRADER1_KEY, TRADER2_KEY, TRADER3_KEY, TRADER4_KEY, MINER_KEY],
        },
        arbitrumTest: {
            url: "https://arbitrum-goerli.infura.io/v3/" + INFURA_KEY,
            chainId: 421613,
            gas: 8000000,
            accounts: [PRIVATE_KEY, MAKER_ADMIN_KEY, PRICE_ADMIN_KEY, PLATFROM_ADMIN_KEY, TRADER1_KEY, TRADER2_KEY, TRADER3_KEY, TRADER4_KEY, MINER_KEY],
        },
        arbitrumGoerli: {
            url: "https://arbitrum-goerli.infura.io/v3/" + INFURA_KEY,
            chainId: 421613,
            gas: 8000000,
            accounts: [PRIVATE_KEY, MAKER_ADMIN_KEY, PRICE_ADMIN_KEY, PLATFROM_ADMIN_KEY, TRADER1_KEY, TRADER2_KEY, TRADER3_KEY, TRADER4_KEY, MINER_KEY],
        },
    },
    dependencyCompiler: {
        // We have to compile from source since UniswapV3 doesn't provide artifacts in their npm package
        paths: [
            "@openzeppelin/contracts/proxy/ProxyAdmin.sol",
            "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol",
            "@uniswap/v3-core/contracts/UniswapV3Factory.sol",
            "@uniswap/v3-core/contracts/UniswapV3Pool.sol",
        ],
    },
    contractSizer: {
        // max bytecode size is 24.576 KB
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: true,
        except: ["@openzeppelin/", "@uniswap/", "test/"],
    },
    gasReporter: {
        excludeContracts: ["test"],
    },
    mocha: {
        require: ["ts-node/register/files"],
        jobs: 4,
        timeout: 120000,
        color: true,
    },
}

export default config
