import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BigNumber } from "ethers"
import { formatEther, formatUnits, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { format } from "path"
import {
    AccountBalance,
    BaseToken,
    InsuranceFund,
    MarketRegistry,
    OrderBook,
    TestClearingHouse,
    TestERC20,
    Vault,
} from "../../typechain"
import {
    b2qExactInput,
    findPnlRealizedEvents,
    findPositionLiquidatedEvents,
    q2bExactOutput,
} from "../helper/clearingHouseHelper"
import { initMarket } from "../helper/marketHelper"
import { IGNORABLE_DUST } from "../helper/number"
import { deposit } from "../helper/token"
import { encodePriceSqrt } from "../shared/utilities"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse liquidate trader", () => {
    const [admin, maker, trader1, trader2, liquidator, priceAdmin, user01, fundingFund, platformFund] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture: ClearingHouseFixture
    let clearingHouse: TestClearingHouse
    let marketRegistry: MarketRegistry
    let orderBook: OrderBook
    let accountBalance: AccountBalance
    let insuranceFund: InsuranceFund
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let mockedNFTPriceFeed: MockContract
    let collateralDecimals: number
    const lowerTick: number = 45780
    const upperTick: number = 46440
    const initPrice = "100"

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture(true, 3000))
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        orderBook = fixture.orderBook
        accountBalance = fixture.accountBalance
        insuranceFund = fixture.insuranceFund as InsuranceFund
        vault = fixture.vault
        marketRegistry = fixture.marketRegistry
        collateral = fixture.WETH
        baseToken = fixture.baseToken
        mockedNFTPriceFeed = fixture.mockedNFTPriceFeed
        collateralDecimals = await collateral.decimals()

        await initMarket(fixture, initPrice, undefined, 0)
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits(initPrice, 18)
        })

        // prepare collateral for trader
        await collateral.mint(trader1.address, parseUnits("10", collateralDecimals))
        await deposit(trader1, vault, 10, collateral)

        await collateral.mint(trader2.address, parseUnits("10000000", collateralDecimals))
        await deposit(trader2, vault, 10000000, collateral)

        await collateral.mint(liquidator.address, parseUnits("10000000", collateralDecimals))
        await deposit(liquidator, vault, 10000000, collateral)
    })

    it("long liquidate", async () => {
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('100000'),
            deadline: ethers.constants.MaxUint256,
        })
        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("48"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        {
            await clearingHouse.connect(trader2).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: ethers.constants.MaxUint256.div(1e10),
                sqrtPriceLimitX96: encodePriceSqrt('122', '1'),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        {
            console.log(
                '',
                (await clearingHouse.isLiquidatable(trader1.address))
            )
        }
        {
            let positionSize = await accountBalance.getTakerPositionSize(trader1.address, baseToken.address)
            let r = await (
                await clearingHouse.connect(liquidator).liquidate(trader1.address, baseToken.address, positionSize)
            ).wait()
            let log = await findPositionLiquidatedEvents(clearingHouse, r)[0]
            console.log(
                'realizedPnl',
                formatEther(log.args.realizedPnl),
            )
        }
        {
            await clearingHouse.connect(trader2).closePosition({
                baseToken: baseToken.address,
                sqrtPriceLimitX96: parseEther("0"),
                oppositeAmountBound: parseEther("0"),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            await clearingHouse.connect(liquidator).closePosition({
                baseToken: baseToken.address,
                sqrtPriceLimitX96: parseEther("0"),
                oppositeAmountBound: parseEther("0"),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            let owedRealizedPnlPlatformFund = (await accountBalance.getPnlAndPendingFee(platformFund.address))[0]
            let owedRealizedPnlInsuranceFund = (await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]
            let owedRealizedPnlTrade1 = (await accountBalance.getPnlAndPendingFee(trader1.address))[0]
            let owedRealizedPnlTrade2 = (await accountBalance.getPnlAndPendingFee(trader2.address))[0]
            let owedRealizedPnlAdmin = (await accountBalance.getPnlAndPendingFee(admin.address))[0]
            let owedRealizedPnlLiquidator = (await accountBalance.getPnlAndPendingFee(liquidator.address))[0]

            console.log(
                'owedRealizedPnl',
                formatEther(owedRealizedPnlPlatformFund),
                formatEther(owedRealizedPnlInsuranceFund),
                formatEther(owedRealizedPnlTrade1),
                formatEther(owedRealizedPnlTrade2),
                formatEther(owedRealizedPnlAdmin),
                formatEther(owedRealizedPnlLiquidator),
                formatEther(owedRealizedPnlPlatformFund.add(owedRealizedPnlInsuranceFund).add(owedRealizedPnlTrade1).add(owedRealizedPnlTrade2).add(owedRealizedPnlAdmin).add(owedRealizedPnlLiquidator)),
            )
        }
        // {
        //     await clearingHouse.connect(trader1).openPosition({
        //         baseToken: baseToken.address,
        //         isBaseToQuote: true,
        //         isExactInput: true,
        //         oppositeAmountBound: 0,
        //         amount: parseEther("1"),
        //         sqrtPriceLimitX96: 0,
        //         deadline: ethers.constants.MaxUint256,
        //         referralCode: ethers.constants.HashZero,
        //     })
        // }
    })

    //     // maker add liquidity
    //     await clearingHouse.connect(maker).addLiquidity({
    //         baseToken: baseToken.address,
    //         base: parseEther("100"),
    //         quote: parseEther("10000"),
    //         lowerTick,
    //         upperTick,
    //         minBase: 0,
    //         minQuote: 0,
    //         useTakerBalance: false,
    //         deadline: ethers.constants.MaxUint256,
    //     })
    //     // trader long 0.5 ETH
    //     await clearingHouse.connect(trader).openPosition({
    //         baseToken: baseToken.address,
    //         isBaseToQuote: false,
    //         isExactInput: false,
    //         oppositeAmountBound: 0,
    //         amount: parseEther("0.5"),
    //         sqrtPriceLimitX96: 0,
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     })

    //     mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
    //         return parseUnits(initPrice, 18).sub(parseUnits('15', 18))
    //     })

    //     {
    //         const [, traderUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
    //         console.log(formatEther(traderUnrealizedPnl.toString()))

    //         const freeRatio = await vault.getFreeCollateralByRatio(trader.address, 0.0625e6)
    //         console.log(formatUnits(freeRatio.toString(), 18))

    //         const traderTotalPositionSize = await accountBalance.getTotalPositionSize(trader.address, baseToken.address)
    //         console.log('traderTotalPositionSize', formatEther(traderTotalPositionSize.toString()))
    //     }

    //     await clearingHouse.connect(liquidator)["liquidate(address,address)"](trader.address, baseToken.address)

    //     {
    //         // const [, traderUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
    //         // console.log(formatEther(traderUnrealizedPnl.toString()))

    //         // const freeRatio = await vault.getFreeCollateralByRatio(trader.address, 0.0625e6)
    //         // console.log(formatUnits(freeRatio.toString(), 18))

    //         const traderTotalPositionSize = await accountBalance.getTotalPositionSize(trader.address, baseToken.address)
    //         console.log('traderTotalPositionSize', formatEther(traderTotalPositionSize.toString()))

    //         const [traderOwedRealizedPnl, ,] = await accountBalance.getPnlAndPendingFee(trader.address)
    //         console.log('traderOwedRealizedPnl', formatEther(traderOwedRealizedPnl.toString()))

    //         const liquidatorTotalPositionSize = await accountBalance.getTotalPositionSize(liquidator.address, baseToken.address)
    //         console.log('liquidatorTotalPositionSize', formatEther(liquidatorTotalPositionSize.toString()))

    //         const [liquidatorOwedRealizedPnl, ,] = await accountBalance.getPnlAndPendingFee(liquidator.address)
    //         console.log('liquidatorOwedRealizedPnl', formatEther(liquidatorOwedRealizedPnl.toString()))

    //     }
    //     // await clearingHouse.connect(liquidator).openPosition({
    //     //     baseToken: baseToken.address,
    //     //     isBaseToQuote: true,
    //     //     isExactInput: true,
    //     //     oppositeAmountBound: 0,
    //     //     amount: parseEther("0.5"),
    //     //     sqrtPriceLimitX96: 0,
    //     //     deadline: ethers.constants.MaxUint256,
    //     //     referralCode: ethers.constants.HashZero,
    //     // })
    //     // {
    //     //     const liquidatorTotalPositionSize = await accountBalance.getTotalPositionSize(liquidator.address, baseToken.address)
    //     //     console.log('liquidatorTotalPositionSize', formatEther(liquidatorTotalPositionSize.toString()))

    //     //     const [liquidatorOwedRealizedPnl, ,] = await accountBalance.getPnlAndPendingFee(liquidator.address)
    //     //     console.log('liquidatorOwedRealizedPnl', formatEther(liquidatorOwedRealizedPnl.toString()))
    //     // }
    // })

    // it("short liquidate", async () => {
    //     // maker add liquidity
    //     await clearingHouse.connect(maker).addLiquidity({
    //         baseToken: baseToken.address,
    //         base: parseEther("100"),
    //         quote: parseEther("1000"),
    //         lowerTick,
    //         upperTick,
    //         minBase: 0,
    //         minQuote: 0,
    //         useTakerBalance: false,
    //         deadline: ethers.constants.MaxUint256,
    //     })
    //     // trader short 0.5 ETH
    //     await clearingHouse.connect(trader).openPosition({
    //         baseToken: baseToken.address,
    //         isBaseToQuote: true,
    //         isExactInput: true,
    //         oppositeAmountBound: 0,
    //         amount: parseEther("0.5"),
    //         sqrtPriceLimitX96: 0,
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     })

    //     mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
    //         return parseUnits(initPrice, 6).mul(11200).div(10000)
    //     })

    //     {
    //         const [, traderUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
    //         console.log(formatEther(traderUnrealizedPnl.toString()))

    //         const freeRatio = await vault.getFreeCollateralByRatio(trader.address, 0.0625e6)
    //         console.log(formatUnits(freeRatio.toString(), 18))

    //         const totalPositionSize = await accountBalance.getTotalPositionSize(trader.address, baseToken.address)
    //         console.log(formatEther(totalPositionSize.toString()))
    //     }

    //     await clearingHouse.connect(liquidator)["liquidate(address,address)"](trader.address, baseToken.address)

    //     {
    //         // const [, traderUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
    //         // console.log(formatEther(traderUnrealizedPnl.toString()))

    //         // const freeRatio = await vault.getFreeCollateralByRatio(trader.address, 0.0625e6)
    //         // console.log(formatUnits(freeRatio.toString(), 18))

    //         const totalPositionSize = await accountBalance.getTotalPositionSize(trader.address, baseToken.address)
    //         console.log(formatEther(totalPositionSize.toString()))
    //     }
    // })
})
