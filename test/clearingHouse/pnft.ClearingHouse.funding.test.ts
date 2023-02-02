import { MockContract } from "@eth-optimism/smock"
import { formatEther, parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    ClearingHouseConfig,
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

describe("ClearingHouse funding", () => {
    const [admin, maker, bob, carol] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let clearingHouse: TestClearingHouse
    let clearingHouseConfig: ClearingHouseConfig
    let exchange: TestExchange
    let orderBook: OrderBook
    let accountBalance: TestAccountBalance
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let mockedNFTPriceFeed: MockContract
    let collateralDecimals: number
    let fixture: ClearingHouseFixture

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        clearingHouseConfig = fixture.clearingHouseConfig
        orderBook = fixture.orderBook
        exchange = fixture.exchange as TestExchange
        accountBalance = fixture.accountBalance as TestAccountBalance
        vault = fixture.vault
        collateral = fixture.WETH
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedNFTPriceFeed = fixture.mockedNFTPriceFeed
        collateralDecimals = await collateral.decimals()

        const initPrice = "100"
        await initMarket(fixture, initPrice, undefined, 0)
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits("100", 18)
        })

        await collateral.mint(bob.address, parseUnits("1000", collateralDecimals))
        await deposit(bob, vault, 1000, collateral)

        await collateral.mint(carol.address, parseUnits("1000", collateralDecimals))
        await deposit(carol, vault, 1000, collateral)

        // initiate both the real and mocked timestamps to enable hard-coded funding related numbers
        await initiateBothTimestamps(clearingHouse)
    })


    describe("# funding updated", () => {
        describe("one maker with one order, multiple takers", () => {
            beforeEach(async () => {
                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: baseToken.address,
                    liquidity: parseEther('10000'),
                    deadline: ethers.constants.MaxUint256,
                })
            })

            // placing this test here as it will be executed first due to the structure
            // twap is introduced by not always setting await forwardBothTimestamps(clearingHouse, ) with values > twapInterval = 900 (default)
            // can notice that markTwaps in this case are different from those in "two takers; first positive then negative funding"
            it("with twap; two takers; positive, negative then positive funding", async () => {
                // set index price for a positive funding
                mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                    return parseUnits("100", 18)
                })

                // bob's position 0 -> -0.099 short
                await clearingHouse.connect(bob).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther("1"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })

                // console.log('getMarketTwap', await getMarketTwap(exchange, baseToken, 0));

                await forwardBothTimestamps(clearingHouse, 86400)

                // bob's funding payment = -0.099 * (153.9531248192 - 150.953124) * 300 / 86400 = -0.001031250282
                expect(await exchange.getPendingFundingPayment(bob.address, baseToken.address)).to.eq(
                    parseEther("0"),
                )

                mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                    return parseUnits("101", 18)
                })

                // carol's position 0 -> 0.09 long
                await clearingHouse.connect(carol).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: ethers.constants.MaxUint256,
                    amount: parseEther("0.9"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })

                // maker's funding payment shouldn't change after carol swaps
                // -(-0.099 * (153.9531248192 - 150.953124) * 300 / 86400) = -0.001031250282
                expect(await exchange.getPendingFundingPayment(bob.address, baseToken.address)).to.eq(
                    parseEther("0"),
                )

                // let [, markTwap, indexTwap] = await exchange.getFundingGrowthGlobalAndTwaps(baseToken.address)
                // console.log(
                //     'markTwap indexTwap',
                //     formatEther(markTwap),
                //     formatEther(indexTwap),
                // )

                // return

                await forwardBothTimestamps(clearingHouse, 86400)

                expect((await accountBalance.getMarketPositionSize(baseToken.address))[0]).to.eq(
                    parseEther("0.9"),
                )
                expect((await accountBalance.getMarketPositionSize(baseToken.address))[1]).to.eq(
                    parseEther("1"),
                )

                // notice that markTwap here is not 154.3847760162 as in "two takers; first positive then negative funding", though having the same amount swapped
                // bob's funding payment = -1 * ((99.979958944630260000 - 101) * 86400) / 86400 * 0.25 = 0.000329085991037307
                expect(await exchange.getPendingFundingPayment(bob.address, baseToken.address)).to.eq(
                    parseEther("0.255010263842434168"),
                )
                // carol's funding payment = 0.09 * (154.1996346489 - 156.953124) * 450 / 86400 * (0.099 / 0.09) * 0.25 = -0.000329085991037307
                expect(await exchange.getPendingFundingPayment(carol.address, baseToken.address)).to.eq(
                    parseEther("-0.000329085991037307"),
                )
                // maker's funding payment = 0
                expect(await exchange.getPendingFundingPayment(maker.address, baseToken.address)).to.eq(
                    parseEther("0"),
                )

                // set index price for a negative funding
                mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                    return parseUnits("101", 18)
                })

                // bob swaps to trigger funding update & funding-related prices emission
                const tx = await clearingHouse.connect(bob).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther("0.0000000001"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })

                await expect(tx)
                    .to.emit(clearingHouse, "FundingPaymentSettled")
                    .withArgs(bob.address, baseToken.address, parseEther("0.000329085991037307"))
                // await expect(tx)
                //     .to.emit(exchange, "FundingUpdated")
                //     .withArgs(baseToken.address, parseEther("154.199634648900471640"), parseEther("156.953124"))

                expect(await exchange.getPendingFundingPayment(bob.address, baseToken.address)).to.eq(
                    parseEther("0"),
                )

                // note that bob will settle his pending funding payment here
                await forwardBothTimestamps(clearingHouse, 250)

                // set index price for a positive funding
                mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                    return parseUnits("145.953124", 18)
                })

                // delta price > 2.5%

                // bob's funding payment = (-0.0990000001 * (154.2767498877 - 145.953124) * 250 / 86400 * 1.0) * (0.09 / 0.0990000001) = -0.002195742712544159
                expect(await exchange.getPendingFundingPayment(bob.address, baseToken.address)).to.eq(
                    parseEther("-0.002199763149419581"),
                )
                // carol's funding payment = 0.09 * (154.1996346489 - 156.953124) * 450 / 86400 * (0.099 / 0.09) * 0.25 + 0.09 * (154.2767498877 - 145.953124) * 250 / 86400 * 1.0 = 0.001862676687991911
                expect(await exchange.getPendingFundingPayment(carol.address, baseToken.address)).to.eq(
                    parseEther("0.001870677158382273"),
                )
                // maker's funding payment = 0
                // there is minor imprecision in this case
                expect(await exchange.getPendingFundingPayment(maker.address, baseToken.address)).to.eq(
                    parseEther("0"),
                )

                // bob's position -0.0990000001 + 0.3 -> 0.2009999999 long
                await clearingHouse.connect(bob).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: ethers.constants.MaxUint256,
                    amount: parseEther("0.3"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })

                // carol + bob = 0.09 + 0.2009999999
                expect((await accountBalance.getMarketPositionSize(baseToken.address))[0]).to.eq(
                    parseEther("0.2909999999"),
                )
                expect((await accountBalance.getMarketPositionSize(baseToken.address))[1]).to.eq(
                    parseEther("0"),
                )

                // bob's funding payment = (-0.0990000001 * (154.2767498877 - 145.953124) * 250 / 86400 * 1.0) * (0.09 / 0.0990000001) = -0.002195742712544159
                expect(await exchange.getPendingFundingPayment(bob.address, baseToken.address)).to.eq(
                    parseEther("0"),
                )
                // carol's funding payment = 0.09 * (154.1996346489 - 156.953124) * 450 / 86400 * (0.099 / 0.09) * 0.25 + 0.09 * (154.2767498877 - 145.953124) * 250 / 86400 * 1.0 = 0.001862676687991911
                expect(await exchange.getPendingFundingPayment(carol.address, baseToken.address)).to.eq(
                    parseEther("0.001870677158382273"),
                )

                await forwardBothTimestamps(clearingHouse, 500)

                expect((await accountBalance.getMarketPositionSize(baseToken.address))[0]).to.eq(
                    parseEther("0.2909999999"),
                )
                expect((await accountBalance.getMarketPositionSize(baseToken.address))[1]).to.eq(
                    parseEther("0"),
                )

                // bob's funding payment = (-0.0990000001 * (154.2767498877 - 145.953124) * 250 / 86400 * 1.0) * (0.09 / 0.0990000001) = -0.002195742712544159
                expect(await exchange.getPendingFundingPayment(bob.address, baseToken.address)).to.eq(
                    parseEther("0"),
                )
                // carol's funding payment = 0.09 * (154.1996346489 - 156.953124) * 450 / 86400 * (0.099 / 0.09) * 0.25 + 0.09 * (154.2767498877 - 145.953124) * 250 / 86400 * 1.0 = 0.001862676687991911
                expect(await exchange.getPendingFundingPayment(carol.address, baseToken.address)).to.eq(
                    parseEther("0.001870677158382273"),
                )
            })
        })
    })
})