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
import { getMaxTickRange, IGNORABLE_DUST } from "../test/helper/number"
import { deposit } from "../test/helper/token"
import { ClearingHouseFixture, createClearingHouseFixture } from "../test/clearingHouse/fixtures"

import { encodePriceSqrt, isAscendingTokenOrder } from "../test/shared/utilities"

import helpers from "./helpers";
const { waitForDeploy, waitForTx, verifyContract } = helpers;

describe("Deployment check", () => {
    const [admin, maker, trader, liquidator, priceAdmin, platformFund] = waffle.provider.getWallets()
    beforeEach(async () => {
    })

    it("check", async () => {
        let deployData = {} as DeployData
        deployData.priceAdminAddress = priceAdmin.address
        deployData.platformFundAddress = platformFund.address
        deployData.makerFundAddress = maker.address
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
        deployData.vETH = {
            symbol: "vETH",
            name: "vETH",
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

        let proxyAdmin = await waitForDeploy(await ProxyAdmin.deploy());
        deployData.proxyAdminAddress = proxyAdmin.address
        {
            const NftPriceFeed = await ethers.getContractFactory("NftPriceFeed")
            const priceFeed = (await waitForDeploy(await NftPriceFeed.deploy('BAYC_ETH'))) as NftPriceFeed
            deployData.nftPriceFeedBAYC.address = priceFeed.address
        }
        {
            const NftPriceFeed = await ethers.getContractFactory("NftPriceFeed")
            const priceFeed = (await waitForDeploy(await NftPriceFeed.deploy('BAYC_ETH'))) as NftPriceFeed
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
        if (deployData.vETH.implAddress == undefined || deployData.vETH.implAddress == '') {
            let quoteToken = await waitForDeploy(await QuoteToken.deploy());
            {
                deployData.vETH.implAddress = quoteToken.address;
            }
        }
        {
            var quoteToken = await ethers.getContractAt('QuoteToken', deployData.vETH.implAddress);
            var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.vETH.name, deployData.vETH.symbol]);
            for (let i = 0; i < 32; i++) {
                var transparentUpgradeableProxy = await waitForDeploy(
                    await TransparentUpgradeableProxy.deploy(
                        quoteToken.address,
                        proxyAdmin.address,
                        initializeData,
                    )
                );
                if (deployData.vETH.address == undefined ||
                    deployData.vETH.address == '' ||
                    isAscendingTokenOrder(deployData.vETH.address, transparentUpgradeableProxy.address.toString())) {
                    deployData.vETH.address = transparentUpgradeableProxy.address;
                    if (deployData.vETH.address.toLowerCase().startsWith("0xf")) {
                        console.log('OK vETH')
                        break
                    }
                }
            }
        }
        const vETH = (await ethers.getContractAt('QuoteToken', deployData.vETH.address)) as BaseToken;
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
            } while (!isAscendingTokenOrder(transparentUpgradeableProxy.address.toString(), vETH.address))
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
            } while (!isAscendingTokenOrder(transparentUpgradeableProxy.address.toString(), vETH.address))
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
        const ClearingHouseConfig = await ethers.getContractFactory("ClearingHouseConfig");
        {
            const clearingHouseConfig = await waitForDeploy(await ClearingHouseConfig.deploy())
            {
                deployData.clearingHouseConfig.implAddress = clearingHouseConfig.address;
            }
        }
        {
            var clearingHouseConfig = await ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.implAddress);
            var initializeData = clearingHouseConfig.interface.encodeFunctionData('initialize', []);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.clearingHouseConfig.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.clearingHouseConfig.address = transparentUpgradeableProxy.address;
            }
        }
        const MarketRegistry = await ethers.getContractFactory("MarketRegistry");
        {
            const marketRegistry = await waitForDeploy(await MarketRegistry.deploy())
            {
                deployData.marketRegistry.implAddress = marketRegistry.address;
            }
        }
        {
            var marketRegistry = await ethers.getContractAt('MarketRegistry', deployData.marketRegistry.implAddress);
            var initializeData = marketRegistry.interface.encodeFunctionData('initialize', [deployData.uniswapV3Factory.address, deployData.vETH.address]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.marketRegistry.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.marketRegistry.address = transparentUpgradeableProxy.address;
            }
        }
        const OrderBook = await ethers.getContractFactory("OrderBook");
        {
            const orderBook = await waitForDeploy(await OrderBook.deploy())
            {
                deployData.orderBook.implAddress = orderBook.address;
            }
        }
        {
            var orderBook = await ethers.getContractAt('OrderBook', deployData.orderBook.implAddress);
            var initializeData = orderBook.interface.encodeFunctionData('initialize', [deployData.marketRegistry.address]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.orderBook.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.orderBook.address = transparentUpgradeableProxy.address;
            }
        }
        const AccountBalance = await ethers.getContractFactory("AccountBalance");
        {
            const accountBalance = await waitForDeploy(await AccountBalance.deploy())
            {
                deployData.accountBalance.implAddress = accountBalance.address;
            }
        }
        {
            var accountBalance = await ethers.getContractAt('AccountBalance', deployData.accountBalance.implAddress);
            var initializeData = accountBalance.interface.encodeFunctionData('initialize', [deployData.clearingHouseConfig.address, deployData.orderBook.address]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.accountBalance.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.accountBalance.address = transparentUpgradeableProxy.address;
            }
        }
        const Exchange = await ethers.getContractFactory("Exchange");
        if (deployData.exchange.implAddress == undefined || deployData.exchange.implAddress == '') {
            const exchange = await waitForDeploy(await Exchange.deploy())
            {
                deployData.exchange.implAddress = exchange.address;
            }
        }
        {
            var exchange = await ethers.getContractAt('Exchange', deployData.exchange.implAddress);
            var initializeData = exchange.interface.encodeFunctionData('initialize', [deployData.marketRegistry.address, deployData.orderBook.address, deployData.clearingHouseConfig.address]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.exchange.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.exchange.address = transparentUpgradeableProxy.address;
            }
        }
        const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
        {
            const insuranceFund = await waitForDeploy(await InsuranceFund.deploy())
            {
                deployData.insuranceFund.implAddress = insuranceFund.address;
            }
        }
        {
            var insuranceFund = await ethers.getContractAt('InsuranceFund', deployData.insuranceFund.implAddress);
            var initializeData = insuranceFund.interface.encodeFunctionData('initialize', [deployData.wETH.address]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.insuranceFund.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.insuranceFund.address = transparentUpgradeableProxy.address;
            }
        }
        const Vault = await ethers.getContractFactory("Vault");
        {
            const vault = await waitForDeploy(await Vault.deploy())
            {
                deployData.vault.implAddress = vault.address;
            }
        }
        {
            var vault = await ethers.getContractAt('Vault', deployData.vault.implAddress);
            var initializeData = vault.interface.encodeFunctionData('initialize', [
                deployData.insuranceFund.address,
                deployData.clearingHouseConfig.address,
                deployData.accountBalance.address,
                deployData.exchange.address,
                deployData.makerFundAddress,
            ]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.vault.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.vault.address = transparentUpgradeableProxy.address;
            }
        }
        const CollateralManager = await ethers.getContractFactory("CollateralManager");
        if (deployData.collateralManager.implAddress == undefined || deployData.collateralManager.implAddress == '') {
            const collateralManager = await waitForDeploy(await CollateralManager.deploy())
            {
                deployData.collateralManager.implAddress = collateralManager.address;
            }
        }
        if (deployData.collateralManager.address == undefined || deployData.collateralManager.address == '') {
            var collateralManager = await ethers.getContractAt('CollateralManager', deployData.collateralManager.implAddress);
            var initializeData = collateralManager.interface.encodeFunctionData('initialize', [
                deployData.clearingHouseConfig.address,
                deployData.vault.address,
                3, // maxCollateralTokensPerAccount
                "750000", // debtNonSettlementTokenValueRatio
                "500000", // liquidationRatio
                "5000", // mmRatioBuffer
                "12500", // clInsuranceFundFeeRatio
                parseUnits("10", deployData.wETH.decimals), // debtThreshold
                parseUnits("0.3", deployData.wETH.decimals), // collateralValueDust
            ]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.collateralManager.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.collateralManager.address = transparentUpgradeableProxy.address;
            }
        }
        const GenericLogic = await ethers.getContractFactory("GenericLogic");
        if (deployData.genericLogic.address == undefined || deployData.genericLogic.address == '') {
            const genericLogic = await waitForDeploy(await GenericLogic.deploy())
            {
                deployData.genericLogic.address = genericLogic.address;
            }
        }
        var genericLogic = await ethers.getContractAt('GenericLogic', deployData.genericLogic.address);
        const LiquidityLogic = await ethers.getContractFactory("LiquidityLogic", {
            libraries: {
                GenericLogic: genericLogic.address,
            },
        });
        const ExchangeLogic = await ethers.getContractFactory("ExchangeLogic", {
            libraries: {
                GenericLogic: genericLogic.address,
            },
        });
        {
            const liquidityLogic = await waitForDeploy(await LiquidityLogic.deploy())
            {
                deployData.liquidityLogic.address = liquidityLogic.address;
            }
        }
        {
            const exchangeLogic = await waitForDeploy(await ExchangeLogic.deploy())
            {
                deployData.exchangeLogic.address = exchangeLogic.address;
            }
        }
        var liquidityLogic = await ethers.getContractAt('LiquidityLogic', deployData.liquidityLogic.address);
        var exchangeLogic = await ethers.getContractAt('ExchangeLogic', deployData.exchangeLogic.address);
        let ClearingHouse = await ethers.getContractFactory("ClearingHouse", {
            libraries: {
                LiquidityLogic: liquidityLogic.address,
                ExchangeLogic: exchangeLogic.address,
            },
        });
        {
            const clearingHouse = await waitForDeploy(await ClearingHouse.deploy())
            {
                deployData.clearingHouse.implAddress = clearingHouse.address;
            }
        }
        {
            var clearingHouse = await ethers.getContractAt('ClearingHouse', deployData.clearingHouse.implAddress);
            var initializeData = clearingHouse.interface.encodeFunctionData('initialize', [
                deployData.clearingHouseConfig.address,
                deployData.vault.address,
                deployData.vETH.address,
                deployData.uniswapV3Factory.address,
                deployData.exchange.address,
                deployData.accountBalance.address,
                deployData.marketRegistry.address,
                deployData.insuranceFund.address,
                deployData.platformFundAddress,
                deployData.makerFundAddress,
            ]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.clearingHouse.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.clearingHouse.address = transparentUpgradeableProxy.address;
            }
        }
        {
            var uniswapV3Factory = await ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
            var clearingHouseConfig = await ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address);
            var marketRegistry = (await ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address));
            var orderBook = (await ethers.getContractAt('OrderBook', deployData.orderBook.address));
            var accountBalance = (await ethers.getContractAt('AccountBalance', deployData.accountBalance.address));
            var exchange = await ethers.getContractAt('Exchange', deployData.exchange.address);
            var insuranceFund = await ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address);
            var vault = await ethers.getContractAt('Vault', deployData.vault.address);
            var collateralManager = await ethers.getContractAt('CollateralManager', deployData.collateralManager.address);
            var clearingHouse = await ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);

            var uniFeeTier = 3000 // 1%

            await exchange.setAccountBalance(accountBalance.address)
            await orderBook.setExchange(exchange.address)
            await vault.setCollateralManager(collateralManager.address)
            await insuranceFund.setVault(vault.address)
            await accountBalance.setVault(vault.address)
            await clearingHouseConfig.setSettlementTokenBalanceCap(ethers.constants.MaxUint256)
            await marketRegistry.setClearingHouse(clearingHouse.address)
            await orderBook.setClearingHouse(clearingHouse.address)
            await exchange.setClearingHouse(clearingHouse.address)
            await accountBalance.setClearingHouse(clearingHouse.address)
            await vault.setClearingHouse(clearingHouse.address)

            const vBAYC = await ethers.getContractAt('BaseToken', deployData.vBAYC.address);
            {
                await uniswapV3Factory.createPool(deployData.vBAYC.address, deployData.vETH.address, uniFeeTier)
                const poolBAYCAddr = await uniswapV3Factory.getPool(vBAYC.address, vETH.address, uniFeeTier)
                const poolBAYC = await ethers.getContractAt('UniswapV3Pool', poolBAYCAddr);
                await vBAYC.addWhitelist(poolBAYC.address)
                await vETH.addWhitelist(poolBAYC.address)
            }

            const vMAYC = await ethers.getContractAt('BaseToken', deployData.vMAYC.address);
            {
                await uniswapV3Factory.createPool(deployData.vMAYC.address, deployData.vETH.address, uniFeeTier)
                const poolMAYCAddr = await uniswapV3Factory.getPool(vMAYC.address, vETH.address, uniFeeTier)
                const poolMAYC = await ethers.getContractAt('UniswapV3Pool', poolMAYCAddr);
                await vMAYC.addWhitelist(poolMAYC.address)
                await vETH.addWhitelist(poolMAYC.address)
            }

            // deploy clearingHouse
            await vETH.addWhitelist(clearingHouse.address)
            await vBAYC.addWhitelist(clearingHouse.address)
            await vMAYC.addWhitelist(clearingHouse.address)

            await vETH.mintMaximumTo(clearingHouse.address)
            await vBAYC.mintMaximumTo(clearingHouse.address)
            await vMAYC.mintMaximumTo(clearingHouse.address)

            // initMarket
            var maxTickCrossedWithinBlock: number = getMaxTickRange()
            // vBAYC
            {
                const poolAddr = await uniswapV3Factory.getPool(vBAYC.address, vETH.address, uniFeeTier)
                const uniPool = await ethers.getContractAt('UniswapV3Pool', poolAddr);
                await uniPool.initialize(encodePriceSqrt('100', "1"))
                const uniFeeRatio = await uniPool.fee()
                await uniPool.increaseObservationCardinalityNext(500)
                await marketRegistry.addPool(vBAYC.address, uniFeeRatio)
                await exchange.setMaxTickCrossedWithinBlock(vBAYC.address, maxTickCrossedWithinBlock)
            }
            // vMAYC
            {
                const poolAddr = await uniswapV3Factory.getPool(vMAYC.address, vETH.address, uniFeeTier)
                const uniPool = await ethers.getContractAt('UniswapV3Pool', poolAddr);
                await uniPool.initialize(encodePriceSqrt('100', "1"))
                const uniFeeRatio = await uniPool.fee()
                await uniPool.increaseObservationCardinalityNext(500)
                await marketRegistry.addPool(vMAYC.address, uniFeeRatio)
                await exchange.setMaxTickCrossedWithinBlock(vMAYC.address, maxTickCrossedWithinBlock)
            }
        }
        {
            // deploy UniV3 factory
            var uniswapV3Factory = await ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
            var clearingHouseConfig = await ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address);
            var marketRegistry = (await ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address));
            var orderBook = (await ethers.getContractAt('OrderBook', deployData.orderBook.address));
            var accountBalance = (await ethers.getContractAt('AccountBalance', deployData.accountBalance.address));
            var exchange = await ethers.getContractAt('Exchange', deployData.exchange.address);
            var insuranceFund = await ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address);
            var vault = await ethers.getContractAt('Vault', deployData.vault.address);
            var collateralManager = await ethers.getContractAt('CollateralManager', deployData.collateralManager.address);
            var clearingHouse = await ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);

            var wETH = (await ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;
            const vBAYC = await ethers.getContractAt('BaseToken', deployData.vBAYC.address);
            const vMAYC = await ethers.getContractAt('BaseToken', deployData.vBAYC.address);

            {
                var priceFeed = await ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address);
                await waitForTx(
                    await priceFeed.setPrice(parseEther('100'))
                )
            }
            {
                var priceFeed = await ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address);
                await waitForTx(
                    await priceFeed.setPrice(parseEther('100'))
                )
            }
            const lowerTick: number = 45780
            const upperTick: number = 46440
            for (var baseToken of [vBAYC, vMAYC]) {
                {
                    await waitForTx(
                        await clearingHouse.connect(maker).addLiquidity({
                            baseToken: baseToken.address,
                            base: parseEther("100"),
                            quote: parseEther("10000"),
                            lowerTick,
                            upperTick,
                            minBase: 0,
                            minQuote: 0,
                            useTakerBalance: false,
                            deadline: ethers.constants.MaxUint256,
                        })
                    )
                }
                {
                    await waitForTx(
                        await wETH.mint(trader.address, parseEther('1000'))
                    )
                    await waitForTx(
                        await wETH.connect(trader).approve(vault.address, ethers.constants.MaxUint256)
                    )
                    await waitForTx(
                        await vault.connect(trader).deposit(wETH.address, parseEther('1000'))
                    )
                }
                {
                    await waitForTx(
                        await clearingHouse.connect(trader).openPosition({
                            baseToken: baseToken.address,
                            isBaseToQuote: true,
                            isExactInput: true,
                            oppositeAmountBound: 0,
                            amount: parseEther("0.5"),
                            sqrtPriceLimitX96: 0,
                            deadline: ethers.constants.MaxUint256,
                            referralCode: ethers.constants.HashZero,
                        })
                    )
                }
                {
                    await waitForTx(
                        await clearingHouse.connect(trader).closePosition({
                            baseToken: baseToken.address,
                            sqrtPriceLimitX96: parseEther("0"),
                            oppositeAmountBound: parseEther("0"),
                            deadline: ethers.constants.MaxUint256,
                            referralCode: ethers.constants.HashZero,
                        }),
                        'clearingHouse.connect(trader).closePosition'
                    )
                }
                {
                    await waitForTx(
                        await clearingHouse.connect(maker).removeLiquidity({
                            baseToken: baseToken.address,
                            lowerTick,
                            upperTick,
                            liquidity: (
                                await orderBook.getOpenOrder(admin.address, wETH.address, lowerTick, upperTick)
                            ).liquidity,
                            minBase: parseEther("0"),
                            minQuote: parseEther("0"),
                            deadline: ethers.constants.MaxUint256,
                        })
                    )
                }
            }
        }
    })
})
