import { MockContract } from "@eth-optimism/smock"
import { parseUnits, parseEther } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { expect } from "chai"
import {
    BaseToken,
    ClearingHouseConfig,
    CollateralManager,
    Exchange,
    InsuranceFund,
    MarketRegistry,
    OrderBook,
    QuoteToken,
    TestAccountBalance,
    TestClearingHouse,
    TestERC20,
    TestWETH9,
    UniswapV3Pool,
    Vault
} from "../../../typechain"
import { initMarket } from "../../helper/marketHelper"
import { deposit } from "../../helper/token"
import { ClearingHouseFixture, createClearingHouseFixture } from "../fixtures"
import { BigNumber, Wallet } from "ethers"
describe("Vault test deposit", () => {

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
    let weth: TestERC20
    const initPrice = "1"
    let collateralManager: CollateralManager

    const check = async (user: Wallet, hasAccountValue: boolean, accountValueDust: number = 0) => {
        let freeCollateral: BigNumber
        let accountValue: BigNumber

        // check user
        freeCollateral = await vault.getFreeCollateral(user.address)
        await expect(vault.connect(user).withdrawAll(weth.address))
            .to.emit(vault, "Withdrawn")
            .withArgs(weth.address, user.address, freeCollateral)

        freeCollateral = await vault.getFreeCollateral(user.address)
        accountValue = await clearingHouse.getAccountValue(user.address)
        expect(freeCollateral).to.be.eq("0")
        if (!hasAccountValue) {
            expect(accountValue).to.be.closeTo(parseEther("0"), accountValueDust)
        }
        await expect(vault.connect(user).withdraw(weth.address, "1")).to.be.revertedWith("V_NEFC")
    }

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
        collateralManager = fixture.collateralManager
        weth = fixture.WETH

        await initMarket(fixture, initPrice, undefined, 0)
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits(initPrice, 18)
        })

        // prepare collateral for trader
        await weth.mint(trader1.address, parseUnits("1000", collateralDecimals))
        await weth.connect(trader1).approve(vault.address, ethers.constants.MaxUint256)

        await weth.connect(trader2).approve(vault.address, ethers.constants.MaxUint256)

    })

    describe("withdraw settlement token", async () => {
        let amount: ReturnType<typeof parseUnits>
        beforeEach(async () => {
            await deposit(trader1, vault, 100, weth)
            amount = parseUnits("100", await weth.decimals())
        })

        it("emit event and update balances", async () => {
            const balanceBefore = await weth.balanceOf(trader1.address)

            await expect(vault.connect(trader1).withdraw(weth.address, amount))
                .to.emit(vault, "Withdrawn")
                .withArgs(weth.address, trader1.address, amount)

            // decrease vault's token balance
            expect(await weth.balanceOf(vault.address)).to.eq("0")

            const balanceAfter = await weth.balanceOf(trader1.address)
            // sender's token balance increased
            expect(balanceAfter.sub(balanceBefore)).to.eq(amount)

            // update sender's balance in vault
            expect(await vault.getBalance(trader1.address)).to.eq("0")
        })

        it("force error, freeCollateral is not enough", async () => {
            await expect(
                vault.connect(trader1).withdraw(weth.address, parseUnits("150", await weth.decimals())),
            ).to.be.revertedWith("V_NEFC")
        })
    })

})
