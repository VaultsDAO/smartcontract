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

describe("ClearingHouse liquidate taker", () => {
    const [admin, maker, taker, liquidator] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture: ClearingHouseFixture
    let clearingHouse: TestClearingHouse
    let marketRegistry: MarketRegistry
    let orderBook: OrderBook
    let accountBalance: AccountBalance
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let mockedBaseAggregator: MockContract
    let collateralDecimals: number
    let takerUsdcBalanceBefore: BigNumber
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
        collateral = fixture.USDC
        baseToken = fixture.baseToken
        mockedBaseAggregator = fixture.mockedBaseAggregator
        collateralDecimals = await collateral.decimals()

        await initMarket(fixture, initPrice, undefined, 0)
        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits(initPrice, 6), 0, 0, 0]
        })

        // prepare collateral for taker
        await collateral.mint(taker.address, parseUnits("10", collateralDecimals))
        await deposit(taker, vault, 10, collateral)

        await collateral.mint(liquidator.address, parseUnits("1000", collateralDecimals))
        await deposit(liquidator, vault, 1000, collateral)
    })

    it("long liquidate", async () => {
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("100"),
            quote: parseEther("1000"),
            lowerTick,
            upperTick,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })
        // taker long 0.5 ETH
        await clearingHouse.connect(taker).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            oppositeAmountBound: 0,
            amount: parseEther("0.5"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })

        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits(initPrice, 6).sub(parseUnits('15', 6)), 0, 0, 0]
        })

        {
            const [, takerUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(taker.address)
            console.log(formatEther(takerUnrealizedPnl.toString()))

            const freeRatio = await vault.getFreeCollateralByRatio(taker.address, 0.0625e6)
            console.log(formatUnits(freeRatio.toString(), 18))

            const takerTotalPositionSize = await accountBalance.getTotalPositionSize(taker.address, baseToken.address)
            console.log('takerTotalPositionSize', formatEther(takerTotalPositionSize.toString()))
        }

        await clearingHouse.connect(liquidator)["liquidate(address,address)"](taker.address, baseToken.address)

        {
            // const [, takerUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(taker.address)
            // console.log(formatEther(takerUnrealizedPnl.toString()))

            // const freeRatio = await vault.getFreeCollateralByRatio(taker.address, 0.0625e6)
            // console.log(formatUnits(freeRatio.toString(), 18))

            const takerTotalPositionSize = await accountBalance.getTotalPositionSize(taker.address, baseToken.address)
            console.log('takerTotalPositionSize', formatEther(takerTotalPositionSize.toString()))

            const [liquidatorOwedRealizedPnl, , ] = await accountBalance.getPnlAndPendingFee(liquidator.address)
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
    //     // taker short 0.5 ETH
    //     await clearingHouse.connect(taker).openPosition({
    //         baseToken: baseToken.address,
    //         isBaseToQuote: true,
    //         isExactInput: true,
    //         oppositeAmountBound: 0,
    //         amount: parseEther("0.5"),
    //         sqrtPriceLimitX96: 0,
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     })

    //     mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
    //         return [0, parseUnits(initPrice, 6).mul(11200).div(10000), 0, 0, 0]
    //     })

    //     {
    //         const [, takerUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(taker.address)
    //         console.log(formatEther(takerUnrealizedPnl.toString()))

    //         const freeRatio = await vault.getFreeCollateralByRatio(taker.address, 0.0625e6)
    //         console.log(formatUnits(freeRatio.toString(), 18))

    //         const totalPositionSize = await accountBalance.getTotalPositionSize(taker.address, baseToken.address)
    //         console.log(formatEther(totalPositionSize.toString()))
    //     }

    //     await clearingHouse.connect(liquidator)["liquidate(address,address)"](taker.address, baseToken.address)

    //     {
    //         // const [, takerUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(taker.address)
    //         // console.log(formatEther(takerUnrealizedPnl.toString()))

    //         // const freeRatio = await vault.getFreeCollateralByRatio(taker.address, 0.0625e6)
    //         // console.log(formatUnits(freeRatio.toString(), 18))

    //         const totalPositionSize = await accountBalance.getTotalPositionSize(taker.address, baseToken.address)
    //         console.log(formatEther(totalPositionSize.toString()))
    //     }
    // })
})
