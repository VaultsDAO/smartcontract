import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BaseContract, BigNumber } from "ethers"
import { formatEther, formatUnits, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { format } from "path"
import {
    AccountBalance,
    BaseToken,
    InsuranceFund,
    MarketRegistry,
    NftPriceFeed,
    OrderBook,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault,
} from "../typechain"
import {
    b2qExactInput,
    findLiquidityChangedEvents,
    findPnlRealizedEvents,
    q2bExactOutput,
    removeAllOrders,
    removeOrder,
} from "../test/helper/clearingHouseHelper"
import { initMarket } from "../test/helper/marketHelper"
import { IGNORABLE_DUST } from "../test/helper/number"
import { deposit } from "../test/helper/token"
import { ClearingHouseFixture, createClearingHouseFixture } from "../test/clearingHouse/fixtures"

import helpers from "./helpers";
import { encodePriceSqrt, isAscendingTokenOrder } from "../test/shared/utilities"
const { waitForDeploy, verifyContract } = helpers;

describe("Deployment check", () => {
    const [admin, maker, trader, liquidator, priceAdmin, platformFund] = waffle.provider.getWallets()
    beforeEach(async () => {
    })

    it("check", async () => {
        let deployData = {} as DeployData
        deployData.priceAdminAddress = admin.address
        deployData.platformFundAddress = admin.address
        deployData.makerFundAddress = admin.address
        deployData.nftPriceFeedBAYC = {
        } as TokenData
        deployData.nftPriceFeedMAYC = {
        } as TokenData
        deployData.wETH = {
            address: '',
            symbol: 'WETH',
            name: 'WETH',
            decimals: 18,
        } as TokenData
        deployData.vUSD = {
            symbol: "vUSD",
            name: "vUSD",
        } as TokenData
        deployData.baseToken = {} as TokenData
        deployData.vBAYC = {
            symbol: "vBAYC",
            name: "vBAYC",
        } as TokenData
        deployData.vMAYC = {
            symbol: "vMAYC",
            name: "vMAYC",
        } as TokenData
        deployData.uniswapV3Factory = {} as ContractData
        deployData.clearingHouseConfig = {} as ContractData
        deployData.marketRegistry = {} as ContractData
        deployData.orderBook = {} as ContractData
        deployData.accountBalance = {} as ContractData
        deployData.exchange = {} as ContractData
        deployData.insuranceFund = {} as ContractData
        deployData.vault = {} as ContractData
        deployData.collateralManager = {} as ContractData
        deployData.genericLogic = {} as ContractData
        deployData.liquidityLogic = {} as ContractData
        deployData.exchangeLogic = {} as ContractData
        deployData.clearingHouse = {} as ContractData

        let ProxyAdmin = await ethers.getContractFactory('ProxyAdmin');
        const TestERC20 = await ethers.getContractFactory("TestERC20")
        const TransparentUpgradeableProxy = await ethers.getContractFactory('TransparentUpgradeableProxy');
        const BaseToken = await ethers.getContractFactory("BaseToken");

        let proxyAdmin = await ProxyAdmin.deploy();
        deployData.proxyAdminAddress = proxyAdmin.address
        {
            const NftPriceFeed = await ethers.getContractFactory("NftPriceFeed")
            const priceFeed = (await (await NftPriceFeed.deploy('BAYC_ETH'))) as NftPriceFeed
            deployData.nftPriceFeedBAYC.address = priceFeed.address
        }
        {
            const NftPriceFeed = await ethers.getContractFactory("NftPriceFeed")
            const priceFeed = (await (await NftPriceFeed.deploy('BAYC_ETH'))) as NftPriceFeed
            deployData.nftPriceFeedMAYC.address = priceFeed.address
        }
        {
            const wETH = (await waitForDeploy(await TestERC20.deploy())) as TestERC20
            {
                deployData.wETH.address = wETH.address;
            }
            await wETH.__TestERC20_init(deployData.wETH.name, deployData.wETH.symbol, deployData.wETH.decimals)
        }
        let QuoteToken = await ethers.getContractFactory("QuoteToken");
        if (deployData.vUSD.implAddress == undefined || deployData.vUSD.implAddress == '') {
            let quoteToken = await waitForDeploy(await QuoteToken.deploy());
            {
                deployData.vUSD.implAddress = quoteToken.address;
            }
        }
        {
            var quoteToken = await ethers.getContractAt('QuoteToken', deployData.vUSD.implAddress);
            var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.vUSD.name, deployData.vUSD.symbol]);
            for (let i = 0; i < 20; i++) {
                var transparentUpgradeableProxy = await waitForDeploy(
                    await TransparentUpgradeableProxy.deploy(
                        quoteToken.address,
                        proxyAdmin.address,
                        initializeData,
                    )
                );
                if (deployData.vUSD.address == undefined ||
                    deployData.vUSD.address == '' ||
                    isAscendingTokenOrder(deployData.vUSD.address, transparentUpgradeableProxy.address.toString())) {
                    deployData.vUSD.address = transparentUpgradeableProxy.address;
                }
            }
        }
        const vUSD = (await ethers.getContractAt('QuoteToken', deployData.vUSD.address)) as BaseToken;
        {
            let baseToken = await waitForDeploy(await BaseToken.deploy());
            {
                deployData.baseToken.implAddress = baseToken.address;
            }
        }
        var baseToken = await ethers.getContractAt('BaseToken', deployData.baseToken.implAddress);
        {
            var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vBAYC.name, deployData.vBAYC.symbol, deployData.nftPriceFeedBAYC.address]);
            var transparentUpgradeableProxy: BaseContract
            do {
                transparentUpgradeableProxy = await waitForDeploy(
                    await TransparentUpgradeableProxy.deploy(
                        baseToken.address,
                        proxyAdmin.address,
                        initializeData,
                    )
                ) as BaseContract;
            } while (!isAscendingTokenOrder(transparentUpgradeableProxy.address.toString(), vUSD.address))
            {
                deployData.vBAYC.address = transparentUpgradeableProxy.address;
            }
        }
        {
            var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vMAYC.name, deployData.vMAYC.symbol, deployData.nftPriceFeedMAYC.address]);
            var transparentUpgradeableProxy: BaseContract
            do {
                transparentUpgradeableProxy = await waitForDeploy(
                    await TransparentUpgradeableProxy.deploy(
                        baseToken.address,
                        proxyAdmin.address,
                        initializeData,
                    )
                ) as BaseContract;
            } while (!isAscendingTokenOrder(transparentUpgradeableProxy.address.toString(), vUSD.address))
            {
                deployData.vMAYC.address = transparentUpgradeableProxy.address;
            }
        }
        const UniswapV3Factory = await ethers.getContractFactory("UniswapV3Factory")
        {
            const uniV3Factory = await waitForDeploy(await UniswapV3Factory.deploy())
            {
                deployData.uniswapV3Factory.address = uniV3Factory.address;
            }
        }
        {
            var uniswapV3Factory = await ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
            var uniFeeTier = 10000 // 0.3%

            const vBAYC = (await ethers.getContractAt('BaseToken', deployData.vBAYC.address)) as BaseToken;
            const vMAYC = (await ethers.getContractAt('BaseToken', deployData.vMAYC.address)) as BaseToken;

            await vUSD.mintMaximumTo(admin.address)
            await vBAYC.mintMaximumTo(admin.address)
            await vMAYC.mintMaximumTo(admin.address)

            {
                await uniswapV3Factory.createPool(deployData.vBAYC.address, deployData.vUSD.address, uniFeeTier)
                const poolBAYCAddr = uniswapV3Factory.getPool(vBAYC.address, vUSD.address, uniFeeTier)
                const poolBAYC = await ethers.getContractAt('UniswapV3Pool', poolBAYCAddr);
                await vBAYC.addWhitelist(poolBAYC.address)
                await vUSD.addWhitelist(poolBAYC.address)
            }

            {
                await uniswapV3Factory.createPool(deployData.vMAYC.address, deployData.vUSD.address, uniFeeTier)
                const poolMAYCAddr = await uniswapV3Factory.getPool(vMAYC.address, vUSD.address, uniFeeTier)
                const poolMAYC = await ethers.getContractAt('UniswapV3Pool', poolMAYCAddr);
                await vMAYC.addWhitelist(poolMAYC.address)
                await vUSD.addWhitelist(poolMAYC.address)
            }

            // vBAYC
            {
                const poolAddr = await uniswapV3Factory.getPool(vBAYC.address, vUSD.address, uniFeeTier)
                const uniPool = (await ethers.getContractAt('UniswapV3Pool', poolAddr)) as UniswapV3Pool;
                await uniPool.initialize(encodePriceSqrt("100", "1"))
                await uniPool.increaseObservationCardinalityNext(500)
            }
            // vMAYC
            {
                const poolAddr = await uniswapV3Factory.getPool(vMAYC.address, vUSD.address, uniFeeTier)
                const uniPool = (await ethers.getContractAt('UniswapV3Pool', poolAddr)) as UniswapV3Pool;
                await uniPool.initialize(encodePriceSqrt("100", "1"))
                await uniPool.increaseObservationCardinalityNext(500)
            }

            {
                const lowerTick: number = 45800
                const upperTick: number = 46400

                const poolAddr = await uniswapV3Factory.getPool(vBAYC.address, vUSD.address, uniFeeTier)
                const uniPool = (await ethers.getContractAt('UniswapV3Pool', poolAddr)) as UniswapV3Pool;

                await uniPool.mint(
                    admin.address,
                    lowerTick,
                    upperTick,
                    '58308536124075417563932',
                    Buffer.from([]),
                )
            }
        }
    })
})
