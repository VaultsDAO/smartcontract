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
    findPFundingPaymentSettledEvents,
    findPnlRealizedEvents,
    q2bExactOutput,
} from "../helper/clearingHouseHelper"
import { initMarket } from "../helper/marketHelper"
import { IGNORABLE_DUST, priceToTick } from "../helper/number"
import { deposit } from "../helper/token"
import { forwardBothTimestamps } from "../shared/time"
import { filterLogs } from "../shared/utilities"
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
        await collateral.mint(trader1.address, parseUnits("10000", collateralDecimals))
        await deposit(trader1, vault, 10000, collateral)

        await collateral.mint(trader2.address, parseUnits("10000", collateralDecimals))
        await deposit(trader2, vault, 10000, collateral)

        await collateral.mint(liquidator.address, parseUnits("10000", collateralDecimals))
        await deposit(liquidator, vault, 10000, collateral)
    })

    it("repeg up", async () => {
        await clearingHouseConfig.setDurationRepegOverPriceSpread(0)
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('100'),
            deadline: ethers.constants.MaxUint256,
        })
        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("20"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        {
            let info = await exchange.getGlobalFundingGrowthInfo(baseToken.address)
            console.log(
                'getGlobalFundingGrowthInfo',
                (info[1].twLongPremiumX96).toString(),
                (info[1].twShortPremiumX96).toString(),
            )
        }
        await forwardBothTimestamps(clearingHouse, 3 * 86400)
        // 
        {
            await clearingHouse.connect(trader2).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("10"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        {
            let info = await exchange.getGlobalFundingGrowthInfo(baseToken.address)
            console.log(
                'getGlobalFundingGrowthInfo',
                (info[1].twLongPremiumX96).toString(),
                (info[1].twShortPremiumX96).toString(),
            )
        }
        await forwardBothTimestamps(clearingHouse, 3 * 86400)
        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("20"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        // 
        {
            let info = await exchange.getGlobalFundingGrowthInfo(baseToken.address)
            console.log(
                'getGlobalFundingGrowthInfo',
                (info[1].twLongPremiumX96).toString(),
                (info[1].twShortPremiumX96).toString(),
            )
        }
        await forwardBothTimestamps(clearingHouse, 3 * 86400)
        // 
        {
            await clearingHouse.connect(trader2).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("10"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        {
            let info = await exchange.getGlobalFundingGrowthInfo(baseToken.address)
            console.log(
                'getGlobalFundingGrowthInfo',
                (info[1].twLongPremiumX96).toString(),
                (info[1].twShortPremiumX96).toString(),
            )
        }
        console.log("before repeg");
        await exchange.connect(maker).isOverPriceSpread(baseToken.address);
        await clearingHouse.connect(maker).repeg(baseToken.address);

        {
            let info = await exchange.getGlobalFundingGrowthInfo(baseToken.address)
            console.log(
                'getGlobalFundingGrowthInfo',
                (info[1].twLongPremiumX96).toString(),
                (info[1].twShortPremiumX96).toString(),
            )
        }

        await forwardBothTimestamps(clearingHouse, 3 * 86400)

        {
            let info = await exchange.getGlobalFundingGrowthInfo(baseToken.address)
            console.log(
                'getGlobalFundingGrowthInfo',
                (info[1].twLongPremiumX96).toString(),
                (info[1].twShortPremiumX96).toString(),
            )
        }

        let e = await (
            await clearingHouse.connect(trader1).closePosition({
                baseToken: baseToken.address,
                sqrtPriceLimitX96: parseEther("0"),
                oppositeAmountBound: parseEther("0"),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        ).wait();

        {
            let info = await exchange.getGlobalFundingGrowthInfo(baseToken.address)
            console.log(
                'getGlobalFundingGrowthInfo',
                (info[1].twLongPremiumX96).toString(),
                (info[1].twShortPremiumX96).toString(),
            )
        }

        let data = await findPFundingPaymentSettledEvents(clearingHouse, e)
        console.log(
            'findPFundingPaymentSettledEvents',
            data,
        )

        await clearingHouse.connect(trader2).closePosition({
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

        console.log(
            'owedRealizedPnl',
            formatEther(owedRealizedPnlPlatformFund),
            formatEther(owedRealizedPnlInsuranceFund),
            formatEther(owedRealizedPnlTrade1),
            formatEther(owedRealizedPnlTrade2),
            formatEther(owedRealizedPnlPlatformFund.add(owedRealizedPnlInsuranceFund).add(owedRealizedPnlTrade1).add(owedRealizedPnlTrade2)),
        )
    })

})
