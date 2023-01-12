import { MockContract } from "@eth-optimism/smock"
import { formatEther, parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    ClearingHouseConfig,
    InsuranceFund,
    OrderBook,
    TestAccountBalance,
    TestClearingHouse,
    TestERC20,
    TestExchange,
    Vault,
} from "../../typechain"
import { QuoteToken } from "../../typechain/QuoteToken"
import { b2qExactInput, findLiquidityChangedEvents, findPositionChangedEvents, q2bExactOutput } from "../helper/clearingHouseHelper"
import { initMarket } from "../helper/marketHelper"
import { deposit } from "../helper/token"
import { forwardBothTimestamps, initiateBothTimestamps } from "../shared/time"
import { getMarketTwap } from "../shared/utilities"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse fee", () => {
    const [admin, maker, bob, carol] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let clearingHouse: TestClearingHouse
    let clearingHouseConfig: ClearingHouseConfig
    let exchange: TestExchange
    let orderBook: OrderBook
    let accountBalance: TestAccountBalance
    let vault: Vault
    let insuranceFund: InsuranceFund
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let mockedBaseAggregator: MockContract
    let collateralDecimals: number
    let fixture: ClearingHouseFixture

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        clearingHouseConfig = fixture.clearingHouseConfig
        orderBook = fixture.orderBook
        exchange = fixture.exchange as TestExchange
        accountBalance = fixture.accountBalance as TestAccountBalance
        insuranceFund = fixture.insuranceFund as InsuranceFund
        vault = fixture.vault
        collateral = fixture.USDC
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedBaseAggregator = fixture.mockedBaseAggregator
        collateralDecimals = await collateral.decimals()

        const initPrice = "154.4310961"
        await initMarket(fixture, initPrice, undefined, 0)
        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits("154", 6), 0, 0, 0]
        })

        await collateral.mint(bob.address, parseUnits("1000", collateralDecimals))
        await deposit(bob, vault, 1000, collateral)

        await collateral.mint(carol.address, parseUnits("1000", collateralDecimals))
        await deposit(carol, vault, 1000, collateral)

        // initiate both the real and mocked timestamps to enable hard-coded funding related numbers
        await initiateBothTimestamps(clearingHouse)
    })

    describe("# fee", () => {
        describe("one maker with one order, multiple takers", () => {
            beforeEach(async () => {
                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: baseToken.address,
                    base: parseUnits("150", await baseToken.decimals()),
                    quote: parseUnits("1500", await quoteToken.decimals()),
                    lowerTick: 50200,
                    upperTick: 50600,
                    minBase: 0,
                    minQuote: 0,
                    useTakerBalance: false,
                    deadline: ethers.constants.MaxUint256,
                })
            })

            // placing this test here as it will be executed first due to the structure
            // twap is introduced by not always setting await forwardBothTimestamps(clearingHouse, ) with values > twapInterval = 900 (default)
            // can notice that markTwaps in this case are different from those in "two takers; first positive then negative funding"
            it("maker -> short -> long", async () => {
                // bob's position 0 -> -0.099 short
                await clearingHouse.connect(bob).openPosition({
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
                await clearingHouse.connect(bob).openPosition({
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
            })
        })

    })
})