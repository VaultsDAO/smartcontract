import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BigNumber } from "ethers"
import { formatEther, formatUnits, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { format } from "path"
import { formatPriceToPriceSqrt } from "../shared/utilities"
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

describe("ClearingHouse fee updated", () => {
    const [admin, maker, trader, liquidator, priceAdmin] = waffle.provider.getWallets()
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
        insuranceFund = fixture.insuranceFund as InsuranceFund
        exchange = fixture.exchange as Exchange
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
        await collateral.mint(trader.address, parseUnits("1000", collateralDecimals))
        await deposit(trader, vault, 1000, collateral)

        await collateral.mint(liquidator.address, parseUnits("1000", collateralDecimals))
        await deposit(liquidator, vault, 1000, collateral)
    })

    it("long fee updated", async () => {
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('10000'),
            deadline: ethers.constants.MaxUint256,
        })
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits("120", 18)
        })
        console.log("before repeg");
        await exchange.connect(maker).isOverPriceSpread(baseToken.address);
        await clearingHouse.connect(trader).repeg(baseToken.address);
        console.log("after repeg");
        await exchange.connect(maker).isOverPriceSpread(baseToken.address);

        //estimate
        // short 100 base
        // await exchange.connect(trader).estimateSwap({
        //     baseToken: baseToken.address,
        //     isBaseToQuote: true,
        //     isExactInput: true,
        //     oppositeAmountBound: 0,
        //     amount: parseEther("100"),
        //     sqrtPriceLimitX96: parseEther("0"),
        //     deadline: ethers.constants.MaxUint256,
        //     referralCode: ethers.constants.HashZero,
        // })
        // //long 100 base
        // await exchange.connect(trader).estimateSwap({
        //     baseToken: baseToken.address,
        //     isBaseToQuote: false,
        //     isExactInput: false,
        //     oppositeAmountBound: 0,
        //     amount: parseEther("100"),
        //     sqrtPriceLimitX96: parseEther("0"),
        //     deadline: ethers.constants.MaxUint256,
        //     referralCode: ethers.constants.HashZero,
        // })
        return

        // await exchange.connect(trader).estimateSwap({
        //     baseToken: baseToken.address,
        //     isBaseToQuote: true,
        //     isExactInput: false,
        //     oppositeAmountBound: 0,
        //     amount: parseEther("9982"),
        //     sqrtPriceLimitX96: parseEther("0"),
        //     deadline: ethers.constants.MaxUint256,
        //     referralCode: ethers.constants.HashZero,
        // })

        // await clearingHouse.connect(trader).estimateSwap({
        //     baseToken: baseToken.address,
        //     isBaseToQuote: true,
        //     isExactInput: false,
        //     oppositeAmountBound: 0,
        //     amount: parseEther("1500000"),
        //     // sqrtPriceLimitX96: parseEther("0"),
        //     sqrtPriceLimitX96: '782283596793893533377783603386',
        //     deadline: ethers.constants.MaxUint256,
        //     referralCode: ethers.constants.HashZero,
        // })

        // console.log("long");

        // await clearingHouse.connect(trader).estimateSwap({
        //     baseToken: baseToken.address,
        //     isBaseToQuote: false,
        //     isExactInput: false,
        //     oppositeAmountBound: 0,
        //     amount: parseEther("100"),
        //     sqrtPriceLimitX96: parseEther("0"),
        //     deadline: ethers.constants.MaxUint256,
        //     referralCode: ethers.constants.HashZero,
        // })

        // await clearingHouse.connect(trader).estimateSwap({
        //     baseToken: baseToken.address,
        //     isBaseToQuote: false,
        //     isExactInput: false,
        //     oppositeAmountBound: 0,
        //     amount: parseUnits("-200", 18),
        //     sqrtPriceLimitX96: parseEther("0"),
        //     deadline: ethers.constants.MaxUint256,
        //     referralCode: ethers.constants.HashZero,
        // })

        // await clearingHouse.connect(trader).estimateSwap({
        //     baseToken: baseToken.address,
        //     isBaseToQuote: false,
        //     isExactInput: false,
        //     oppositeAmountBound: 0,
        //     amount: parseEther("1000"),
        //     sqrtPriceLimitX96: "795008527859486682432425023310",
        //     deadline: ethers.constants.MaxUint256,
        //     referralCode: ethers.constants.HashZero,
        // })

        return

    })
})
