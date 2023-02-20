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
    describe("settlement token", async () => {
        let wethDecimals

        beforeEach(async () => {
            wethDecimals = await weth.decimals()
        })

        it("deposit settlement token", async () => {
            const amount = parseUnits("100", wethDecimals)

            // check event has been sent
            await expect(vault.connect(trader1).deposit(weth.address, amount))
                .to.emit(vault, "Deposited")
                .withArgs(weth.address, trader1.address, amount)

            // reduce trader1 balance
            expect(await weth.balanceOf(trader1.address)).to.eq(parseUnits("900", wethDecimals))

            // increase vault balance
            expect(await weth.balanceOf(vault.address)).to.eq(amount)

            // update sender's balance
            expect(await vault.getBalance(trader1.address)).to.eq(amount)
        })

        it("deposit settlement token for others", async () => {
            const amount = parseUnits("100", wethDecimals)

            await expect(vault.connect(trader1).depositFor(trader2.address, weth.address, amount))
                .to.emit(vault, "Deposited")
                .withArgs(weth.address, trader2.address, amount)

            // reduce trader1 balance
            expect(await weth.balanceOf(trader1.address)).to.eq(parseUnits("900", wethDecimals))

            // trader1's vault balance not changed
            expect(await vault.getBalance(trader1.address)).to.be.eq(parseUnits("0", await weth.decimals()))

            // increase vault balance
            expect(await weth.balanceOf(vault.address)).to.eq(amount)

            // update trader2's balance
            expect(await vault.getBalance(trader2.address)).to.eq(amount)

            // trader2's usdc balance not changed
            expect(await weth.balanceOf(trader2.address)).to.be.eq("0")
        })

        it("should be able to deposit for trader1 herself", async () => {
            const amount = parseUnits("100", await weth.decimals())
            await vault.connect(trader1).depositFor(trader1.address, weth.address, amount)

            const trader1Balance = await vault.getBalance(trader1.address)
            const trader1UsdcBalanceAfter = await weth.balanceOf(trader1.address)

            // reduce trader1's usdc balance
            expect(trader1UsdcBalanceAfter).to.be.eq(parseUnits("900", await weth.decimals()))

            // increase trader1's vault balance
            expect(trader1Balance).to.be.eq(amount)

            // increase vault balance
            expect(await weth.balanceOf(vault.address)).to.eq(parseUnits("100", await weth.decimals()))
        })

        it("force error, not enough balance", async () => {
            const amount = parseUnits("1100", await weth.decimals())
            await expect(vault.connect(trader1).deposit(weth.address, amount)).to.be.revertedWith(
                "ERC20: transfer amount exceeds balance",
            )
            await expect(vault.connect(trader1).depositFor(trader2.address, weth.address, amount)).to.be.revertedWith(
                "ERC20: transfer amount exceeds balance",
            )
        })

        it("force error, inconsistent vault balance with deflationary token", async () => {
            weth.setTransferFeeRatio(50)
            await expect(
                vault.connect(trader1).deposit(weth.address, parseUnits("100", wethDecimals)),
            ).to.be.revertedWith("V_IBA")
            weth.setTransferFeeRatio(0)
        })

        it("force error, deposit for zero address", async () => {
            const amount = parseUnits("1000", await weth.decimals())
            await expect(
                vault.connect(trader1).depositFor(ethers.constants.AddressZero, weth.address, amount),
            ).to.be.revertedWith("V_DFZA")
        })

        it("force error, zero amount", async () => {
            await expect(vault.connect(trader1).deposit(weth.address, "0")).to.be.revertedWith("V_ZA")
            await expect(vault.connect(trader1).depositFor(trader2.address, weth.address, "0")).to.be.revertedWith("V_ZA")
        })

        describe("settlement token balance cap", async () => {
            beforeEach(async () => {
                await clearingHouseConfig.setSettlementTokenBalanceCap(100)
            })

            it("force error, when it's over settlementTokenBalanceCap", async () => {
                await expect(vault.connect(trader1).deposit(weth.address, 101)).to.be.revertedWith("V_GTSTBC")
            })

            it("force error, when the the total balance is over cap", async () => {
                await expect(vault.connect(trader1).deposit(weth.address, 100)).not.be.reverted
                await expect(vault.connect(trader1).deposit(weth.address, 1)).to.be.revertedWith("V_GTSTBC")
            })

            it("can deposit if balanceOf(vault) <= settlementTokenBalanceCap after deposited", async () => {
                await expect(vault.connect(trader1).deposit(weth.address, 99)).not.be.reverted
            })

            it("force error, cannot deposit when settlementTokenBalanceCap == 0", async () => {
                await clearingHouseConfig.setSettlementTokenBalanceCap(0)
                await expect(vault.connect(trader1).deposit(weth.address, 1)).to.be.revertedWith("V_GTSTBC")
                await expect(vault.connect(trader1).deposit(weth.address, 101)).to.be.revertedWith("V_GTSTBC")
            })
        })
    })

    describe("non-settlement token", async () => {
        let wbtcDecimals: number
        let weth9: TestWETH9
        beforeEach(async () => {
            const weth9Factory = await ethers.getContractFactory("TestWETH9")
            weth9 = (await weth9Factory.deploy()) as TestWETH9

            await collateralManager.addCollateral(weth9.address, {
                priceFeed: fixture.mockedWethPriceFeed.address,
                collateralRatio: (0.7e6).toString(),
                discountRatio: (0.1e6).toString(),
                depositCap: parseEther("1000"),
            })
            await vault.setWETH9(weth9.address)

            await weth9.connect(trader1).deposit({ value: parseEther("300") })
            await weth9.connect(trader2).deposit({ value: parseEther("300") })
            await weth9.connect(trader1).approve(vault.address, ethers.constants.MaxUint256)
            await weth9.connect(trader2).approve(vault.address, ethers.constants.MaxUint256)

            wbtcDecimals = await fixture.WBTC.decimals()
            await fixture.WBTC.mint(trader1.address, parseUnits("2000", wbtcDecimals))
            await fixture.WBTC.mint(trader2.address, parseUnits("2000", wbtcDecimals))
            await fixture.WBTC.connect(trader1).approve(vault.address, ethers.constants.MaxUint256)
            await fixture.WBTC.connect(trader2).approve(vault.address, ethers.constants.MaxUint256)
        })

        it("deposit non-settlement token", async () => {
            expect(await vault.getCollateralTokens(trader1.address)).to.be.deep.eq([])
            expect(await vault.getCollateralTokens(trader2.address)).to.be.deep.eq([])

            await expect(vault.connect(trader1).deposit(weth9.address, parseEther("100")))
                .to.emit(vault, "Deposited")
                .withArgs(weth9.address, trader1.address, parseEther("100"))

            expect(await weth9.balanceOf(trader1.address)).to.eq(parseEther("200"))
            expect(await weth9.balanceOf(vault.address)).to.eq(parseEther("100"))
            expect(await vault.getBalanceByToken(trader1.address, weth9.address)).to.eq(parseEther("100"))

            await expect(vault.connect(trader1).depositFor(trader2.address, fixture.WBTC.address, parseUnits("100", wbtcDecimals)))
                .to.emit(vault, "Deposited")
                .withArgs(fixture.WBTC.address, trader2.address, parseUnits("100", wbtcDecimals))

            expect(await fixture.WBTC.balanceOf(trader1.address)).to.eq(parseUnits("1900", wbtcDecimals))
            expect(await fixture.WBTC.balanceOf(vault.address)).to.eq(parseUnits("100", wbtcDecimals))
            expect(await vault.getBalanceByToken(trader2.address, fixture.WBTC.address)).to.eq(parseUnits("100", wbtcDecimals))

            // register collateral tokens
            expect(await vault.getCollateralTokens(trader1.address)).to.be.deep.eq([weth9.address])
            expect(await vault.getCollateralTokens(trader2.address)).to.be.deep.eq([fixture.WBTC.address])
        })

        it("deposit ETH", async () => {
            expect(await vault.getCollateralTokens(trader1.address)).to.be.deep.eq([])
            expect(await vault.getCollateralTokens(trader2.address)).to.be.deep.eq([])

            const trader1ETHBalanceBefore = await trader1.getBalance()

            const tx1 = await vault.connect(trader1).depositEther({ value: parseEther("100") })
            await expect(tx1).to.emit(vault, "Deposited").withArgs(weth9.address, trader1.address, parseEther("100"))

            const tx2 = await vault.connect(trader1).depositEtherFor(trader2.address, { value: parseEther("100") })
            await expect(tx2).to.emit(vault, "Deposited").withArgs(weth9.address, trader2.address, parseEther("100"))

            expect(await weth9.balanceOf(trader1.address)).to.eq(parseEther("300"))
            expect(await weth9.balanceOf(trader2.address)).to.eq(parseEther("300"))
            expect(await weth9.balanceOf(vault.address)).to.eq(parseEther("200"))

            expect(await vault.getBalanceByToken(trader1.address, weth9.address)).to.eq(parseEther("100"))
            expect(await vault.getBalanceByToken(trader2.address, weth9.address)).to.eq(parseEther("100"))

            const tx1Receipt = await tx1.wait()
            const tx2Receipt = await tx2.wait()
            const totalGasUsed = tx1Receipt.gasUsed.mul(tx1.gasPrice).add(tx2Receipt.gasUsed.mul(tx2.gasPrice))
            const trader1ETHBalanceAfter = await trader1.getBalance()
            expect(trader1ETHBalanceBefore.sub(trader1ETHBalanceAfter)).to.eq(parseEther("200").add(totalGasUsed))

            // 600 (originally) + 100 (trader1) + 100 (trader2) = 800
            expect(await ethers.provider.getBalance(weth9.address)).to.be.eq(parseEther("800"))
            expect(await ethers.provider.getBalance(vault.address)).to.be.eq(parseEther("0"))

            expect(await vault.getCollateralTokens(trader1.address)).to.be.deep.eq([weth9.address])
            expect(await vault.getCollateralTokens(trader2.address)).to.be.deep.eq([weth9.address])
        })

        it("deposit for oneself", async () => {
            const trader1ETHBalanceBefore = await trader1.getBalance()

            const tx1 = await vault
                .connect(trader1)
                .depositFor(trader1.address, fixture.WBTC.address, parseUnits("100", wbtcDecimals))
            await expect(tx1)
                .to.emit(vault, "Deposited")
                .withArgs(fixture.WBTC.address, trader1.address, parseUnits("100", wbtcDecimals))

            const tx2 = await vault.connect(trader1).depositEtherFor(trader1.address, { value: parseEther("100") })
            await expect(tx2).to.emit(vault, "Deposited").withArgs(weth9.address, trader1.address, parseEther("100"))

            expect(await weth9.balanceOf(trader1.address)).to.eq(parseEther("300"))
            expect(await weth9.balanceOf(vault.address)).to.eq(parseEther("100"))
            expect(await vault.getBalanceByToken(trader1.address, weth9.address)).to.eq(parseEther("100"))

            const tx1Receipt = await tx1.wait()
            const tx2Receipt = await tx2.wait()
            const totalGasUsed = tx1Receipt.gasUsed.mul(tx1.gasPrice).add(tx2Receipt.gasUsed.mul(tx2.gasPrice))
            const trader1ETHBalanceAfter = await trader1.getBalance()
            expect(trader1ETHBalanceBefore.sub(trader1ETHBalanceAfter)).to.be.eq(parseEther("100").add(totalGasUsed))

            expect(await fixture.WBTC.balanceOf(trader1.address)).to.eq(parseUnits("1900", wbtcDecimals))
            expect(await fixture.WBTC.balanceOf(vault.address)).to.eq(parseUnits("100", wbtcDecimals))
            expect(await vault.getBalanceByToken(trader1.address, fixture.WBTC.address)).to.eq(parseUnits("100", wbtcDecimals))
        })

        it("force error, deposit token is not a collateral token", async () => {
            await expect(vault.connect(trader1).deposit(pool.address, parseEther("100"))).to.be.revertedWith("V_OSCT")
            await expect(
                vault.connect(trader1).depositFor(trader2.address, pool.address, parseEther("100")),
            ).to.be.revertedWith("V_OSCT")

            // WETH is set with a wrong address
            await vault.setWETH9(pool.address)
            await expect(vault.connect(trader1).depositEther({ value: parseEther("100") })).to.be.revertedWith("V_WINAC")
        })

        it("force error, max collateral tokens per account exceeded", async () => {
            await collateralManager.setMaxCollateralTokensPerAccount(1)

            await expect(vault.connect(trader1).depositEther({ value: parseEther("100") }))
                .to.emit(vault, "Deposited")
                .withArgs(weth9.address, trader1.address, parseEther("100"))

            await expect(
                vault.connect(trader1).deposit(fixture.WBTC.address, parseUnits("100", wbtcDecimals)),
            ).to.be.revertedWith("V_CTNE")
        })

        it("force error, non-settlement amount exceeds deposit cap", async () => {
            await collateralManager.setDepositCap(weth9.address, parseEther("100"))

            await expect(vault.connect(trader1).deposit(weth9.address, parseEther("100"))).to.emit(vault, "Deposited")

            await expect(vault.connect(trader1).deposit(weth9.address, parseEther("1"))).to.be.revertedWith("V_GTDC")
            await expect(vault.connect(trader1).depositEther({ value: parseEther("1") })).to.be.revertedWith("V_GTDC")
            await expect(
                vault.connect(trader1).depositEtherFor(trader2.address, { value: parseEther("1") }),
            ).to.be.revertedWith("V_GTDC")
        })

        it("force error, cannot deposit when non-settlement token deposit cap == 0", async () => {
            await collateralManager.setDepositCap(weth9.address, 0)

            await expect(vault.connect(trader1).deposit(weth9.address, parseEther("100"))).to.be.revertedWith("V_GTDC")
            await expect(vault.connect(trader1).depositEther({ value: parseEther("100") })).to.be.revertedWith("V_GTDC")
            await expect(
                vault.connect(trader1).depositEtherFor(trader2.address, { value: parseEther("100") }),
            ).to.be.revertedWith("V_GTDC")
        })

        it("force error, zero amount", async () => {
            await expect(vault.connect(trader1).deposit(weth9.address, parseEther("0"))).to.be.revertedWith("V_ZA")
            await expect(vault.connect(trader1).depositEther()).to.be.revertedWith("V_ZA")
            await expect(vault.connect(trader1).depositEtherFor(trader2.address)).to.be.revertedWith("V_ZA")
        })

        it("force error, zero address", async () => {
            await expect(
                vault.connect(trader1).depositFor(ethers.constants.AddressZero, weth9.address, parseEther("10")),
            ).to.be.revertedWith("V_DFZA")
            await expect(
                vault.connect(trader1).depositEtherFor(ethers.constants.AddressZero, { value: parseEther("10") }),
            ).to.be.revertedWith("V_DFZA")
        })
    })
})
