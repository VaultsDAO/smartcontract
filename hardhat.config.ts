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
            gas: 8000000,
        },
        arbitrumGoerli: {
            url: "https://arbitrum-goerli.infura.io/v3/" + INFURA_KEY,
            chainId: 421613,
            gas: 8000000,
            accounts: [PRIVATE_KEY],
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
        except: ["@openzeppelin/", "@uniswap/", "@perp/perp-oracle-contract/", "test/"],
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
