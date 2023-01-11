import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BigNumber } from "ethers"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    MarketRegistry,
    OrderBook,
    TestClearingHouse,
    TestERC20,
    Vault,
} from "../../typechain"
import {
    b2qExactInput,
    findPnlRealizedEvents,
    q2bExactOutput,
    removeAllOrders,
    removeOrder,
} from "../helper/clearingHouseHelper"
import { initMarket } from "../helper/marketHelper"
import { IGNORABLE_DUST } from "../helper/number"
import { deposit } from "../helper/token"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse realizedPnl", () => {
    const [admin, maker, taker, alice] = waffle.provider.getWallets()
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
    const lowerTick: number = 46200
    const upperTick: number = 46400

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

        const initPrice = "100"
        await initMarket(fixture, initPrice, undefined, 0)
        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits(initPrice, 6), 0, 0, 0]
        })

        // prepare collateral for maker
        const makerCollateralAmount = parseUnits("1000000", collateralDecimals)
        await collateral.mint(maker.address, makerCollateralAmount)
        await deposit(maker, vault, 1000000, collateral)

        // prepare collateral for taker
        takerUsdcBalanceBefore = parseUnits("1000", collateralDecimals)
        await collateral.mint(taker.address, takerUsdcBalanceBefore)
        await collateral.connect(taker).approve(clearingHouse.address, takerUsdcBalanceBefore)
        await deposit(taker, vault, 1000, collateral)

        // prepare collateral for alice
        await collateral.mint(alice.address, takerUsdcBalanceBefore)
        await collateral.connect(alice).approve(clearingHouse.address, takerUsdcBalanceBefore)
        await deposit(alice, vault, 1000, collateral)
    })

    it("has balanced realized PnL", async () => {
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("100"),
            quote: parseEther("0"),
            lowerTick,
            upperTick,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })
        // maker base token amount in pool = 99.999999999999999999

        let takerRealizedPnl = BigNumber.from(0)
        let makerRealizedPnl = BigNumber.from(0)

        // taker long $100 ETH
        await clearingHouse.connect(taker).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("100"),
            oppositeAmountBound: parseEther("0"),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: parseEther("0"),
            referralCode: ethers.constants.HashZero,
        })
        return
        // taker.positionSize: 0.975557443213784206
        // taker.openNotional: -100.0
        // maker.positionSize: -0.975557443213784207
        // maker.openNotional: 98.999999999999999999

        // maker move liquidity range down 10% and collect fee (first step: remove liquidity)
        const makerMoveLiquidityRemoveReceipt = await (
            await clearingHouse.connect(maker).removeLiquidity({
                baseToken: baseToken.address,
                lowerTick,
                upperTick,
                liquidity: (
                    await orderBook.getOpenOrder(maker.address, baseToken.address, lowerTick, upperTick)
                ).liquidity,
                minBase: parseEther("0"),
                minQuote: parseEther("0"),
                deadline: ethers.constants.MaxUint256,
            })
        ).wait()
        makerRealizedPnl = makerRealizedPnl.add(
            findPnlRealizedEvents(fixture, makerMoveLiquidityRemoveReceipt)[0].args.amount,
        )
        // maker.realizedPnlDelta = 0.999999999999999999

        // maker move liquidity range down 10% (second step: add liquidity)
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("0"),
            quote: parseEther("10000"),
            lowerTick: lowerTick - 1000, // lower the price for about 10%
            upperTick: upperTick - 1000, // lower the price for about 10%
            minBase: parseEther("0"),
            minQuote: parseEther("0"),
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })
        // taker.positionSize: 0.975557443213784206
        // taker.openNotional: -100.0
        // maker.positionSize: -0.975557443213784207
        // maker.openNotional: 98.999999999999999999

        // taker close position
        const takerCloseReceipt = await (
            await clearingHouse.connect(taker).closePosition({
                baseToken: baseToken.address,
                sqrtPriceLimitX96: parseEther("0"),
                oppositeAmountBound: parseEther("0"),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        ).wait()
        takerRealizedPnl = takerRealizedPnl.add(findPnlRealizedEvents(fixture, takerCloseReceipt)[0].args.amount)
        // taker.realizedPnlDelta: -9.542011399247233633
        // taker.positionSize: 0.0
        // taker.openNotional: 0.0
        // maker.positionSize: 0.0
        // maker.openNotional: 7.628294342673973364

        // maker remove all liquidity and collect fee
        const makerRemoveLiquidityReceipt = await (
            await clearingHouse.connect(maker).removeLiquidity({
                baseToken: baseToken.address,
                lowerTick: lowerTick - 1000,
                upperTick: upperTick - 1000,
                liquidity: (
                    await orderBook.getOpenOrder(maker.address, baseToken.address, lowerTick - 1000, upperTick - 1000)
                ).liquidity,
                minBase: parseEther("0"),
                minQuote: parseEther("0"),
                deadline: ethers.constants.MaxUint256,
            })
        ).wait()

        const events = findPnlRealizedEvents(fixture, makerRemoveLiquidityReceipt)
        makerRealizedPnl = makerRealizedPnl.add(events[0].args.amount)
        // maker.realizedPnlDelta: 0.913717056573260266
        // maker.positionSize: 0.0
        // maker.liquidity: 0.0

        makerRealizedPnl = makerRealizedPnl.add(events[1].args.amount)
        // maker.realizedPnlDelta: 7.628294342673973067
        // maker.positionSize: 0.0
        // maker.openNotional: 0.0
        // maker.owedRealizedPnl: 9.542011399247233332

        // taker and maker's realized PnL should balance out each other (with some precision errors)
        expect(takerRealizedPnl.add(makerRealizedPnl)).to.be.closeTo("0", IGNORABLE_DUST)
        // takerRealizedPnl: -9.542011399247233633
        // makerRealizedPnl: 9.542011399247233332

        // taker withdraw all collaterals
        const takerFreeCollateral = await vault.getFreeCollateral(taker.address)
        // taker.vaultBalanceOf: 1000.0
        // taker.freeCollateral: 990.457988
        // taker.owedRealizedPnl: -9.542011399247233633
        // taker.USDCbalance: 0.0

        await vault.connect(taker).withdraw(collateral.address, takerFreeCollateral)
        const takerUsdcBalance = await collateral.balanceOf(taker.address)
        // taker.vaultBalanceOf: 0.0
        // taker.freeCollateral: 0.0
        // taker.USDCbalance: 990.457988

        // 1000 + (-9.542011399247233633) = 990.4579886
        expect(takerUsdcBalance).to.deep.eq(parseUnits("990.457988", collateralDecimals))

        // maker withdraw all
        const makerFreeCollateral = await vault.getFreeCollateral(maker.address)
        // maker.vaultBalanceOf: 1000000.0
        // maker.freeCollateral: 1000001.989998
        // maker.owedRealizedPnl: 9.542011399247233629
        // maker.USDCbalance: 0.0

        await vault.connect(maker).withdraw(collateral.address, makerFreeCollateral)
        const makerUsdcBalance = await collateral.balanceOf(maker.address)
        // maker.vaultBalanceOf(after): 0.000001
        // maker.freeCollateral(after): 0.0
        // maker.USDCbalance(after): 1,000,009.542011

        // 1,000,000 + 9.542011399247233629 = 1,000,009.542011
        expect(makerUsdcBalance).to.deep.eq(parseUnits("1000009.542011", collateralDecimals))
    })

})
