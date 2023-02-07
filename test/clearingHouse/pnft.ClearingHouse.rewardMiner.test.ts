import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BigNumber, ContractReceipt } from "ethers"
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
    QuoteToken,
    RewardMiner,
    TestClearingHouse,
    TestERC20,
    TestRewardMiner,
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
import { ClearingHouseFixture, createClearingHouseFixture, mockPNTTokenFixture } from "./fixtures"

describe("ClearingHouse rewardMiner", () => {

    const [admin, maker, trader1, trader2, liquidator, priceAdmin] = waffle.provider.getWallets()
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
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedNFTPriceFeed: MockContract
    let rewardMiner: TestRewardMiner
    let collateralDecimals: number
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
        pool = fixture.pool as UniswapV3Pool
        collateral = fixture.WETH
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedNFTPriceFeed = fixture.mockedNFTPriceFeed
        rewardMiner = fixture.rewardMiner as TestRewardMiner
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

    it("reward miner", async () => {
        // maker add liquidity
        // await clearingHouse.connect(maker).addLiquidity({
        //     baseToken: baseToken.address,
        //     liquidity: parseEther('10000'),
        //     deadline: ethers.constants.MaxUint256,
        // })

        let mockPNTToken = await mockPNTTokenFixture()

        const periodDuration = 43200;
        const starts = [
            1,
            361,
            721,
            1081,
            1441,
            1801,
            2161,
            2521,
            2881,
            3241,
            3601,
        ]
        const ends = [
            360,
            720,
            1080,
            1440,
            1800,
            2160,
            2520,
            2880,
            3240,
            3600,
            3960,
        ]
        const totals = [
            parseEther('25000.00'),
            parseEther('22500.00'),
            parseEther('20250.00'),
            parseEther('18225.00'),
            parseEther('16402.50'),
            parseEther('14762.25'),
            parseEther('13286.03'),
            parseEther('11957.42'),
            parseEther('10761.68'),
            parseEther('9685.51'),
            parseEther('3836.28'),
        ]
        rewardMiner.__TestRewardMiner_init(
            admin.address,
            mockPNTToken.address,
            periodDuration,
            starts,
            ends,
            totals,
            360,
        )
        await mockPNTToken.mint(rewardMiner.address, parseEther('60000000'))

        await rewardMiner.mint(trader1.address, parseEther('1000'))
        await rewardMiner.mint(trader2.address, parseEther('1000'))

        await rewardMiner.startMiner((await rewardMiner.getBlockTimestamp()))

        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        for (let i = 0; i < 400; i++) {
            await rewardMiner.mint(trader1.address, parseEther('1000'))
            await rewardMiner.mint(trader2.address, parseEther('3000'))
            await rewardMiner.setBlockTimestamp((await rewardMiner.getBlockTimestamp()).add(periodDuration).toString())
            // console.log(
            //     (await rewardMiner.getPeriodNumber()).toString(),
            //     'claimable amount',
            //     formatEther((await rewardMiner.getClaimable(trader1.address))),
            //     formatEther((await rewardMiner.getClaimable(trader2.address))),
            // )
            console.log(i)
        }
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )

        await rewardMiner.connect(trader1).claim();
        await rewardMiner.connect(trader2).claim();

        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),

            formatEther((await mockPNTToken.balanceOf(trader1.address))),
            formatEther((await mockPNTToken.balanceOf(trader2.address))),
        )

        return

        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        await rewardMiner.mint(trader1.address, parseEther('1000'))
        await rewardMiner.mint(trader2.address, parseEther('3000'))
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        await rewardMiner.setBlockTimestamp((await rewardMiner.getBlockTimestamp()).add(1000).toString())
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        await rewardMiner.connect(trader1).claim();
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount after trader1 claim',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        await rewardMiner.mint(trader1.address, parseEther('3000'))
        await rewardMiner.mint(trader2.address, parseEther('1000'))
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        await rewardMiner.setBlockTimestamp((await rewardMiner.getBlockTimestamp()).add(1000).toString())
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        await rewardMiner.connect(trader2).claim();
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount after trader2 claim',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        await rewardMiner.connect(trader1).claim();
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount after trader1 claim',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
        await rewardMiner.mint(trader1.address, parseEther('3000'))
        await rewardMiner.mint(trader2.address, parseEther('1000'))
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),

            formatEther((await mockPNTToken.balanceOf(trader1.address))),
            formatEther((await mockPNTToken.balanceOf(trader2.address))),
        )
        await rewardMiner.setBlockTimestamp((await rewardMiner.getBlockTimestamp()).add(1000).toString())
        console.log(
            (await rewardMiner.getPeriodNumber()).toString(),
            'claimable amount',
            formatEther((await rewardMiner.getClaimable(trader1.address))),
            formatEther((await rewardMiner.getClaimable(trader2.address))),
        )
    })
})
