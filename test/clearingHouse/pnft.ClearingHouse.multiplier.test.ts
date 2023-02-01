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
    UniswapV3Pool,
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
import { IGNORABLE_DUST, priceToTick } from "../helper/number"
import { deposit } from "../helper/token"
import { filterLogs } from "../shared/utilities"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse multiplier", () => {

    const [admin, maker, trader1, trader2, liquidator, priceAdmin] = waffle.provider.getWallets()
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
    const initPrice = "100"

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

        await initMarket(fixture, initPrice, undefined, 0)
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits(initPrice, 18)
        })

        // prepare collateral for trader
        await collateral.mint(trader1.address, parseUnits("1000", collateralDecimals))
        await deposit(trader1, vault, 1000, collateral)

        await collateral.mint(trader2.address, parseUnits("1000", collateralDecimals))
        await deposit(trader2, vault, 1000, collateral)

        await collateral.mint(liquidator.address, parseUnits("1000", collateralDecimals))
        await deposit(liquidator, vault, 1000, collateral)
    })

    it("multiplier", async () => {
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('1000000'),
            deadline: ethers.constants.MaxUint256,
        })
        await accountBalance.testMarketMultiplier(baseToken.address, parseEther('0.5'), parseEther('1.2'))
        expect(await accountBalance.getModifyBaseForMultiplier(trader1.address, baseToken.address, parseEther('0.1'))).to.deep.eq(parseEther("0.2"))
        expect(await accountBalance.getModifyBaseForMultiplier(trader1.address, baseToken.address, parseEther('-2.4'))).to.deep.eq(parseEther("-2"))
    })

    it("short multiplier", async () => {
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('1000000'),
            deadline: ethers.constants.MaxUint256,
        })
        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("1"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        await accountBalance.testMarketMultiplier(baseToken.address, parseEther('1.2'), parseEther('0.5'))
        expect(await accountBalance.getModifyBaseForMultiplier(trader1.address, baseToken.address, parseEther('-0.1'))).to.deep.eq(parseEther("-0.2"))
        expect(await accountBalance.getModifyBaseForMultiplier(trader1.address, baseToken.address, parseEther('0.1'))).to.deep.eq(parseEther("0.2"))
        expect(await accountBalance.getModifyBaseForMultiplier(trader1.address, baseToken.address, parseEther('2'))).to.deep.eq(parseEther("2.25"))
    })

    it("long multiplier", async () => {
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('1000000'),
            deadline: ethers.constants.MaxUint256,
        })
        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("1"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        await accountBalance.testMarketMultiplier(baseToken.address, parseEther('0.5'), parseEther('1.2'))
        expect(await accountBalance.getModifyBaseForMultiplier(trader1.address, baseToken.address, parseEther('0.1'))).to.deep.eq(parseEther("0.2"))
        expect(await accountBalance.getModifyBaseForMultiplier(trader1.address, baseToken.address, parseEther('-0.1'))).to.deep.eq(parseEther("-0.2"))
        expect(await accountBalance.getModifyBaseForMultiplier(trader1.address, baseToken.address, parseEther('-2'))).to.deep.eq(parseEther("-2.25"))
    })
})
