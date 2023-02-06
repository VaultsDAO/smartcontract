import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BigNumber, ContractReceipt } from "ethers"
import bn from "bignumber.js"
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
import { encodePriceSqrt, filterLogs } from "../shared/utilities"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse multiplier", () => {

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
    // const initPrice = "70"
    // const estimatePrice = "69.03"

    beforeEach(async () => {
    })

    async function setup(initPrice) {
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
    }

    it("estimate swap check", async () => {
        const currPrice = "1"

        await setup(currPrice);

        await clearingHouseConfig.setDurationRepegOverPriceSpread(0)

        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('1000'),
            deadline: ethers.constants.MaxUint256,
        })
        let prices = [
            "71022863666244721554",
            "15196068696338998071",
            "63990000000000000000",
            "7597335277777777777",
            "15428716118911291230",
            "5165343879481401594",
            "6260450469664299665"
        ];
        for (let i = 0; i < prices.length; i++) {
            const estimatePrice = prices[i]

            mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                return parseUnits('1000', 18)
            })

            await clearingHouse.repeg(baseToken.address)

            mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                return parseUnits(estimatePrice, 0)
            })

            await clearingHouse.repeg(baseToken.address)

            let res = await exchange.connect(trader1).estimateSwap({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: ethers.constants.MaxUint256.div(1e10),
                sqrtPriceLimitX96: encodePriceSqrt(new bn(formatEther(estimatePrice)).multipliedBy(0.99).toString(), '1'),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            console.log(
                '-----------------quote',
                formatEther(estimatePrice),
                formatEther(res.amountOut),
                (new bn('1000').multipliedBy(50).div(new bn(formatEther(res.amountOut)))).toString()
            )
            console.log(
                '-----------------liquidity',
                (new bn('1000').multipliedBy(50).div(new bn(formatEther(res.amountOut)))).toString()
            )
        }
    })


})
