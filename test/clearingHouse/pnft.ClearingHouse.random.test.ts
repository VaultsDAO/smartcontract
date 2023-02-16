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
        // 60000
        await collateral.mint(rewardMiner.address, parseEther('60000'))
        await clearingHouse.setRewardMiner(rewardMiner.address)

        await rewardMiner.startMiner((await rewardMiner.getBlockTimestamp()))
        await rewardMiner.startPnlMiner(1, '666666')

        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('1000'),
            deadline: ethers.constants.MaxUint256,
        })
        let rndInt;
        for (let i = 0; i < 20; i++) {
            rndInt = (Math.floor(Math.random() * 1000000) % 20) + 1;
            var isBaseToQuote: boolean
            if (i % 2 == 0) {
                isBaseToQuote = true
            } else {
                isBaseToQuote = false
            }
            {
                await clearingHouse.connect(trader1).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: isBaseToQuote,
                    isExactInput: isBaseToQuote,
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
                    isBaseToQuote: !isBaseToQuote,
                    isExactInput: !isBaseToQuote,
                    oppositeAmountBound: 0,
                    amount: parseEther(rndInt.toString()),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })
            }

            if (i % 2 == 0) {
                rndInt = (Math.floor(Math.random() * 1000000) % 20) + 1;
                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: baseToken.address,
                    liquidity: parseEther(rndInt.toString()),
                    deadline: ethers.constants.MaxUint256,
                })
                mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                    return parseUnits("1.25", 18)
                })
            } else {
                rndInt = (Math.floor(Math.random() * 1000000) % 20) + 1;
                await clearingHouse.connect(maker).removeLiquidity({
                    baseToken: baseToken.address,
                    liquidity: parseEther(rndInt.toString()),
                    deadline: ethers.constants.MaxUint256,
                })
                mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                    return parseUnits("0.8", 18)
                })
            }

            let minerInfo = await rewardMiner.getCurrentPeriodInfo()
            console.log(
                'minerInfo',
                (minerInfo.periodNumber).toString(),
                formatEther(minerInfo.total),
                formatEther(minerInfo.amount),
                formatEther(minerInfo.pnlAmount),
            )

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

            // await rewardMiner.connect(trader2).claim();
            // if (i % 2 == 0) {
            //     await rewardMiner.connect(trader1).claim();
            // } else {
            //     await rewardMiner.connect(trader2).claim();
            // }

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


// minerInfo 0.000000000000000001 1000.0 26.480321134555652227 -0.061318557706672761
// 2 claimable amount 210.418700763302481629 122.91529923669751837
// minerInfo 0.000000000000000002 1000.0 7.547664941678835982 -0.047491104932859655
// 3 claimable amount 277.571139003309285325 360.472148298508344411
// minerInfo 0.000000000000000003 1000.0 15.729526709551557389 -0.039323816773878894
// 4 claimable amount 561.434764369342197604 49.47037463396708772
// minerInfo 0.000000000000000004 1000.0 41.773401088574285809 -0.136144005035552717
// 5 claimable amount 141.869864465541772495 219.049412832728071503
// minerInfo 0.000000000000000005 2000.0 11.233619328250378819 0.122297644099063324
// 6 claimable amount 283.914761143224475695 1923.192398837180342073
// minerInfo 0.000000000000000006 2000.0 23.978693384997715803 -0.146056567348416434
// 7 claimable amount 315.976950577953931491 350.691049422046068508
// minerInfo 0.000000000000000007 2000.0 20.638093666161569391 0.09416766614032588
// 8 claimable amount 597.438648975138796675 2867.442761218136095639
// minerInfo 0.000000000000000008 2000.0 32.542109835807213573 -0.242338911078088966
// 9 claimable amount 206.704633397002694605 459.963366602997305394
// minerInfo 0.000000000000000009 3000.0 13.761592652430440207 0.048629068900907249
// 10 claimable amount 264.785658608593545444 4092.706897180909052653
// minerInfo 0.00000000000000001 3000.0 42.239719710641323298 -0.096610600411228339
// 11 claimable amount 574.397052602197990641 425.604947397802009358
// minerInfo 0.000000000000000011 3000.0 19.362526587426318213 -0.240296658369534903
// 12 claimable amount 739.077654005644087552 835.321398596553903088
// minerInfo 0.000000000000000012 3000.0 11.262628062868696575 -0.028156570157171742
// 13 claimable amount 334.07408950098915716 665.927910499010842839
// minerInfo 0.000000000000000013 4000.0 23.533355331195304364 -0.045723970102801288
// 14 claimable amount 1180.745700502889982961 5578.221733981425144768
// minerInfo 0.000000000000000014 4000.0 11.361031683795892536 -0.028402579209489731
// 15 claimable amount 1184.153881582709431022 149.182118417290568977
// minerInfo 0.000000000000000015 4000.0 21.935009448382192492 -0.079571066028653758
// 16 claimable amount 2139.464154218656873109 3421.43769247635607539
// minerInfo 0.000000000000000016 4000.0 33.053758515569856126 -0.074997364388940186
// 17 claimable amount 717.204581202277874863 616.131418797722125136
// minerInfo 0.000000000000000017 5000.0 11.267786604538152262 -0.019845881032146968
// 18 claimable amount 953.437149814980838285 2026.558610411514772948
// minerInfo 0.000000000000000018 5000.0 42.255037064788602594 -0.096645197363101139
// 19 claimable amount 957.293958048431677724 709.376041951568322274
// minerInfo 0.000000000000000019 5000.0 29.080466396872235317 -0.007217628772075614
// 20 claimable amount 1813.532910190297609106 104868.417449324829591108


// minerInfo 0.000000000000000005 2000.0 11.233619328250378819 0.122297644099063324
// minerInfo 0.000000000000000007 2000.0 20.638093666161569391 0.09416766614032588
// minerInfo 0.000000000000000009 3000.0 13.761592652430440207 0.048629068900907249

// 55000*1/3+2000*0.666666+2000*0.666666+3000*0.666666 = 22999.9953333333

// 1813.532910190297609106+104868.417449324829591108 = 106681.9503595151