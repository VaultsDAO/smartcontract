import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BigNumber, ContractReceipt } from "ethers"
import { formatEther, formatUnits, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { format } from "path"
import {
    AccountBalance,
    BaseToken,
    ClearingHouseConfig,
    Exchange,
    InsuranceFund,
    MarketRegistry,
    OrderBook,
    QuoteToken,
    TestAccountBalance,
    TestClearingHouse,
    TestERC20,
    TestRewardMiner,
    UniswapV3Pool,
    Vault,
} from "../../typechain"
import {
    b2qExactInput,
    findLiquidityChangedEvents,
    findPnlRealizedEvents,
    q2bExactOutput,
} from "../helper/clearingHouseHelper"
import { initMarket } from "../helper/marketHelper"
import { IGNORABLE_DUST, priceToTick } from "../helper/number"
import { deposit } from "../helper/token"
import { forwardBothTimestamps } from "../shared/time"
import { filterLogs } from "../shared/utilities"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse random trade liquidity repeg close", () => {

    const [admin, maker, trader1, trader2, liquidator, priceAdmin, user01, fundingFund, platformFund] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture: ClearingHouseFixture
    let clearingHouse: TestClearingHouse
    let clearingHouseConfig: ClearingHouseConfig
    let marketRegistry: MarketRegistry
    let orderBook: OrderBook
    let accountBalance: TestAccountBalance
    let vault: Vault
    let insuranceFund: InsuranceFund
    let exchange: Exchange
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedNFTPriceFeed: MockContract
    let collateralDecimals: number
    let rewardMiner: TestRewardMiner
    const initPrice = "1"

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        clearingHouseConfig = fixture.clearingHouseConfig as ClearingHouseConfig
        orderBook = fixture.orderBook
        accountBalance = fixture.accountBalance as TestAccountBalance
        vault = fixture.vault
        insuranceFund = fixture.insuranceFund as InsuranceFund
        exchange = fixture.exchange as Exchange
        marketRegistry = fixture.marketRegistry
        pool = fixture.pool as UniswapV3Pool
        collateral = fixture.WETH
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedNFTPriceFeed = fixture.mockedNFTPriceFeed
        collateralDecimals = await collateral.decimals()
        rewardMiner = fixture.rewardMiner as TestRewardMiner

        await initMarket(fixture, initPrice, undefined, 0)
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits(initPrice, 18)
        })

        // prepare collateral for trader
        await collateral.mint(trader1.address, parseUnits("1000000", collateralDecimals))
        await deposit(trader1, vault, 1000000, collateral)

        await collateral.mint(trader2.address, parseUnits("1000000", collateralDecimals))
        await deposit(trader2, vault, 1000000, collateral)

        await collateral.mint(liquidator.address, parseUnits("1000000", collateralDecimals))
        await deposit(liquidator, vault, 1000000, collateral)
    })

    it("random check", async () => {
        await forwardBothTimestamps(clearingHouse, 86400)

        await clearingHouseConfig.setDurationRepegOverPriceSpread(0)

        rewardMiner.__TestRewardMiner_init(
            clearingHouse.address,
            collateral.address,
            86400,
            [1, 5, 9, 13, 17],
            [4, 8, 12, 16, 20],
            [
                parseEther('1000'),
                parseEther('2000'),
                parseEther('3000'),
                parseEther('4000'),
                parseEther('5000'),
            ],
            360,
        )
        await collateral.mint(rewardMiner.address, parseEther('60000'))
        await clearingHouse.setRewardMiner(rewardMiner.address)

        await rewardMiner.startMiner((await rewardMiner.getBlockTimestamp()))

        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('1000'),
            deadline: ethers.constants.MaxUint256,
        })
        let rndInt;
        for (let i = 0; i < 20; i++) {
            rndInt = (Math.floor(Math.random() * 1000000) % 20) + 1;
            {
                await clearingHouse.connect(trader1).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther(rndInt.toString()),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })
            }
            rndInt = (Math.floor(Math.random() * 1000000) % 20) + 1;
            {
                await clearingHouse.connect(trader2).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther(rndInt.toString()),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })
            }

            if (i % 2 == 0) {
                // rndInt = (Math.floor(Math.random() * 1000000) % 20) + 1;
                // await clearingHouse.connect(maker).addLiquidity({
                //     baseToken: baseToken.address,
                //     liquidity: parseEther(rndInt.toString()),
                //     deadline: ethers.constants.MaxUint256,
                // })
                mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                    return parseUnits("1.25", 18)
                })
            } else {
                // rndInt = (Math.floor(Math.random() * 1000000) % 20) + 1;
                // await clearingHouse.connect(maker).removeLiquidity({
                //     baseToken: baseToken.address,
                //     liquidity: parseEther(rndInt.toString()),
                //     deadline: ethers.constants.MaxUint256,
                // })
                mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                    return parseUnits("0.8", 18)
                })
            }

            await exchange.updateOverPriceSpreadTimestamp(baseToken.address)

            await clearingHouse.repeg(baseToken.address)

            await forwardBothTimestamps(clearingHouse, 86400)

            await rewardMiner.setBlockTimestamp((await rewardMiner.getBlockTimestamp()).add(86400).toString())

            console.log(
                (await rewardMiner.getPeriodNumber()).toString(),
                'claimable amount',
                formatEther((await rewardMiner.getClaimable(trader1.address))),
                formatEther((await rewardMiner.getClaimable(trader2.address))),
            )

            await rewardMiner.connect(trader2).claim();
            if (i % 2 == 0) {
                await rewardMiner.connect(trader1).claim();
            } else {
                await rewardMiner.connect(trader2).claim();
            }

            // if (i % 4 == 0) {
            //     await clearingHouse.connect(admin).emergencyLiquidate(trader1.address, baseToken.address);
            // }
            // if (i % 4 == 2) {
            //     await clearingHouse.connect(admin).emergencyLiquidate(trader1.address, baseToken.address);
            // }
        }

        await clearingHouse.connect(trader1).closePosition({
            baseToken: baseToken.address,
            sqrtPriceLimitX96: parseEther("0"),
            oppositeAmountBound: parseEther("0"),
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })

        await clearingHouse.connect(trader2).closePosition({
            baseToken: baseToken.address,
            sqrtPriceLimitX96: parseEther("0"),
            oppositeAmountBound: parseEther("0"),
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        {
            let size1 = (await accountBalance.getTotalPositionSize(trader1.address, baseToken.address))
            console.log(
                'getTotalPositionSize1',
                formatEther(size1),
            )
            let size2 = (await accountBalance.getTotalPositionSize(trader2.address, baseToken.address))
            console.log(
                'getTotalPositionSize2',
                formatEther(size2),
            )
        }

        await rewardMiner.connect(trader1).claim();
        await rewardMiner.connect(trader2).claim();

        let owedRealizedPnlPlatformFund = (await accountBalance.getPnlAndPendingFee(platformFund.address))[0]
        let owedRealizedPnlInsuranceFund = (await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]
        let owedRealizedPnlTrade1 = (await accountBalance.getPnlAndPendingFee(trader1.address))[0]
        let owedRealizedPnlTrade2 = (await accountBalance.getPnlAndPendingFee(trader2.address))[0]
        let owedRealizedPnlAdmin = (await accountBalance.getPnlAndPendingFee(admin.address))[0]

        console.log(
            'owedRealizedPnl',
            formatEther(owedRealizedPnlPlatformFund),
            formatEther(owedRealizedPnlInsuranceFund),
            formatEther(owedRealizedPnlTrade1),
            formatEther(owedRealizedPnlTrade2),
            formatEther(owedRealizedPnlAdmin),
            formatEther(owedRealizedPnlPlatformFund.add(owedRealizedPnlInsuranceFund).add(owedRealizedPnlTrade1).add(owedRealizedPnlTrade2).add(owedRealizedPnlAdmin)),
            formatEther(await insuranceFund.getRepegAccumulatedFund()),
            formatEther(await insuranceFund.getRepegDistributedFund()),
        )

        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
            formatEther((await collateral.balanceOf(trader1.address))),
            formatEther((await collateral.balanceOf(trader2.address))),
        )

        await vault.connect(trader1).withdrawAll(collateral.address)
        await vault.connect(trader2).withdrawAll(collateral.address)
        await vault.connect(platformFund).withdrawAll(collateral.address)

        owedRealizedPnlPlatformFund = (await accountBalance.getPnlAndPendingFee(platformFund.address))[0]
        owedRealizedPnlInsuranceFund = (await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]
        owedRealizedPnlTrade1 = (await accountBalance.getPnlAndPendingFee(trader1.address))[0]
        owedRealizedPnlTrade2 = (await accountBalance.getPnlAndPendingFee(trader2.address))[0]
        owedRealizedPnlAdmin = (await accountBalance.getPnlAndPendingFee(admin.address))[0]

        console.log(
            'owedRealizedPnl',
            formatEther(owedRealizedPnlPlatformFund),
            formatEther(owedRealizedPnlInsuranceFund),
            formatEther(owedRealizedPnlTrade1),
            formatEther(owedRealizedPnlTrade2),
            formatEther(owedRealizedPnlAdmin),
            formatEther(owedRealizedPnlPlatformFund.add(owedRealizedPnlInsuranceFund).add(owedRealizedPnlTrade1).add(owedRealizedPnlTrade2).add(owedRealizedPnlAdmin)),
            formatEther(await insuranceFund.getRepegAccumulatedFund()),
            formatEther(await insuranceFund.getRepegDistributedFund()),
        )
    })


})
