import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BigNumber } from "ethers"
import { formatEther, formatUnits, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { format } from "path"
import {
    AccountBalance,
    BaseToken,
    Exchange,
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
    let insuranceFund: InsuranceFund
    let exchange: Exchange
    let collateral: TestERC20
    let baseToken: BaseToken
    let mockedBaseAggregator: MockContract
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
        insuranceFund = fixture.insuranceFund as InsuranceFund
        exchange = fixture.exchange as Exchange
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
        await collateral.mint(taker.address, parseUnits("1000", collateralDecimals))
        await deposit(taker, vault, 1000, collateral)

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
        // 
        await clearingHouse.connect(taker).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: false,
            oppositeAmountBound: 0,
            amount: parseEther("100"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        expect((await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]).to.eq(
            parseEther("0.1"),
        )
        const [, , , , , , , , platformFund] = waffle.provider.getWallets()
        expect((await accountBalance.getPnlAndPendingFee(platformFund.address))[0]).to.eq(
            parseEther("0.1"),
        )
        await clearingHouse.connect(taker).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: false,
            oppositeAmountBound: 0,
            amount: parseEther("100"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        expect((await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]).to.eq(
            parseEther("0.2"),
        )
        expect((await accountBalance.getPnlAndPendingFee(platformFund.address))[0]).to.eq(
            parseEther("0.2"),
        )
        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits("96", 6), 0, 0, 0]
        })
        // short 100$
        await clearingHouse.connect(taker).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: false,
            oppositeAmountBound: 0,
            amount: parseEther("100"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        expect((await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]).to.eq(
            parseEther("1.04485"),
        )
        expect((await accountBalance.getPnlAndPendingFee(platformFund.address))[0]).to.eq(
            parseEther("0.3"),
        )
        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits("96", 6), 0, 0, 0]
        })
        // long 100$
        await clearingHouse.connect(taker).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            oppositeAmountBound: 0,
            amount: parseEther("100"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        expect((await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]).to.eq(
            parseEther("1.04485"),
        )
        expect((await accountBalance.getPnlAndPendingFee(platformFund.address))[0]).to.eq(
            parseEther("0.4"),
        )
    })
})
