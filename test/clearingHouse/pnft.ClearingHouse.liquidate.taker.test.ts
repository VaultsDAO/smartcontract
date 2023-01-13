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
    findLiquidityChangedEvents,
    findPnlRealizedEvents,
    q2bExactOutput,
    removeAllOrders,
    removeOrder,
} from "../helper/clearingHouseHelper"
import { initMarket } from "../helper/marketHelper"
import { IGNORABLE_DUST } from "../helper/number"
import { deposit } from "../helper/token"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse liquidate trader", () => {
    const [admin, maker, trader, liquidator, priceAdmin] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture: ClearingHouseFixture
    let clearingHouse: TestClearingHouse
    let marketRegistry: MarketRegistry
    let orderBook: OrderBook
    let accountBalance: AccountBalance
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let mockedNFTPriceFeed: MockContract
    let collateralDecimals: number
    const lowerTick: number = 45800
    const upperTick: number = 46400
    const initPrice = "100"

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        orderBook = fixture.orderBook
        accountBalance = fixture.accountBalance
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
        await collateral.mint(trader.address, parseUnits("10", collateralDecimals))
        await deposit(trader, vault, 10, collateral)

        await collateral.mint(liquidator.address, parseUnits("1000", collateralDecimals))
        await deposit(liquidator, vault, 1000, collateral)
    })

    it("long liquidate", async () => {

        // maker add liquidity
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
        // trader long 0.5 ETH
        await clearingHouse.connect(trader).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            oppositeAmountBound: 0,
            amount: parseEther("0.5"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })

        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits(initPrice, 18).sub(parseUnits('15', 18))
        })

        {
            const [, traderUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
            console.log(formatEther(traderUnrealizedPnl.toString()))

            const freeRatio = await vault.getFreeCollateralByRatio(trader.address, 0.0625e6)
            console.log(formatUnits(freeRatio.toString(), 18))

            const traderTotalPositionSize = await accountBalance.getTotalPositionSize(trader.address, baseToken.address)
            console.log('traderTotalPositionSize', formatEther(traderTotalPositionSize.toString()))
        }

        await clearingHouse.connect(liquidator)["liquidate(address,address)"](trader.address, baseToken.address)

        {
            // const [, traderUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
            // console.log(formatEther(traderUnrealizedPnl.toString()))

            // const freeRatio = await vault.getFreeCollateralByRatio(trader.address, 0.0625e6)
            // console.log(formatUnits(freeRatio.toString(), 18))

            const traderTotalPositionSize = await accountBalance.getTotalPositionSize(trader.address, baseToken.address)
            console.log('traderTotalPositionSize', formatEther(traderTotalPositionSize.toString()))

            const [traderOwedRealizedPnl, ,] = await accountBalance.getPnlAndPendingFee(trader.address)
            console.log('traderOwedRealizedPnl', formatEther(traderOwedRealizedPnl.toString()))

            const liquidatorTotalPositionSize = await accountBalance.getTotalPositionSize(liquidator.address, baseToken.address)
            console.log('liquidatorTotalPositionSize', formatEther(liquidatorTotalPositionSize.toString()))

            const [liquidatorOwedRealizedPnl, ,] = await accountBalance.getPnlAndPendingFee(liquidator.address)
            console.log('liquidatorOwedRealizedPnl', formatEther(liquidatorOwedRealizedPnl.toString()))

        }
        await clearingHouse.connect(liquidator).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: true,
            oppositeAmountBound: 0,
            amount: parseEther("0.5"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        {
            const liquidatorTotalPositionSize = await accountBalance.getTotalPositionSize(liquidator.address, baseToken.address)
            console.log('liquidatorTotalPositionSize', formatEther(liquidatorTotalPositionSize.toString()))

            const [liquidatorOwedRealizedPnl, ,] = await accountBalance.getPnlAndPendingFee(liquidator.address)
            console.log('liquidatorOwedRealizedPnl', formatEther(liquidatorOwedRealizedPnl.toString()))
        }
    })

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
