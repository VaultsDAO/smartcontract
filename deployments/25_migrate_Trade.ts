import fs from "fs";

import hre, { ethers } from "hardhat";

import bn from "bignumber.js"

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../test/shared/utilities";
import { AccountBalance, BaseToken, Exchange, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, TestERC20, UniswapV3Pool, Vault } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";
import BigNumber from "bignumber.js";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
const { waitForTx, tryWaitForTx } = helpers;


async function main() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 

    const [admin, maker, priceAdmin, platformFund, trader1, trader2, trader3, trader4] = await ethers.getSigners()

    // deploy UniV3 factory
    var uniswapV3Factory = await hre.ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
    var clearingHouseConfig = await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address);
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = (await hre.ethers.getContractAt('Exchange', deployData.exchange.address)) as Exchange;
    var insuranceFund = await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address);
    var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
    var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address);
    var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);

    var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

    const vETH = (await ethers.getContractAt('QuoteToken', deployData.vETH.address)) as QuoteToken;
    const vBAYC = (await ethers.getContractAt('BaseToken', deployData.vBAYC.address)) as BaseToken;
    const vMAYC = (await ethers.getContractAt('BaseToken', deployData.vMAYC.address)) as BaseToken;

    var priceFeedBAYC = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address)) as NftPriceFeed;
    var priceFeedMAYC = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address)) as NftPriceFeed;

    var uniFeeTier = 3000 // 0.3%

    // let marketInfo = await exchange.getDetalTawpInsuranceFundFee

    // let [longSize, shortSize] = await accountBalance.getMarketPositionSize(vBAYC.address)
    // console.log('getMarketPositionSize', formatEther(longSize), formatEther(shortSize))

    // let accountInfo = await accountBalance.getAccountInfo(trader1.address, vBAYC.address)
    // console.log('getAccountInfo1',
    //     (new bn(accountInfo.lastLongTwPremiumGrowthGlobalX96.toString()).div(new bn('2').pow(new bn('96')))).toString(),
    //     (new bn(accountInfo.lastShortTwPremiumGrowthGlobalX96.toString()).div(new bn('2').pow(new bn('96')))).toString(),
    // )
    // accountInfo = await accountBalance.getAccountInfo(trader2.address, vBAYC.address)
    // console.log('getAccountInfo2',
    //     (new bn(accountInfo.lastLongTwPremiumGrowthGlobalX96.toString()).div(new bn('2').pow(new bn('96')))).toString(),
    //     (new bn(accountInfo.lastShortTwPremiumGrowthGlobalX96.toString()).div(new bn('2').pow(new bn('96')))).toString(),
    // )

    // let [fundingGrowthData, markTwap, indexTwap] = (await exchange.getFundingGrowthGlobalAndTwaps(vBAYC.address))
    // console.log(
    //     'getFundingGrowthGlobalAndTwaps',
    //     fundingGrowthData.twLongPremiumX96.div((new bn(2).pow(96)).toString()).toString(),
    //     fundingGrowthData.twShortPremiumX96.div((new bn(2).pow(96)).toString()).toString(),
    //     formatEther(markTwap),
    //     formatEther(indexTwap),
    // )

    // let [realizedPnl] = await accountBalance.getPnlAndPendingFee(trader1.address)
    // console.log(
    //     'realizedPnl',
    //     formatEther(realizedPnl),
    // )

    // let [realizedPnl1, unrealizedPnl1] = await accountBalance.getPnlAndPendingFee(trader1.address)
    // console.log(
    //     'getPnlAndPendingFee1',
    //     formatEther(realizedPnl1),
    //     formatEther(unrealizedPnl1),
    // )
    // let [realizedPnl2, unrealizedPnl2] = await accountBalance.getPnlAndPendingFee(trader2.address)
    // console.log(
    //     'getPnlAndPendingFee2',
    //     formatEther(realizedPnl2),
    //     formatEther(unrealizedPnl2),
    // )

    // for (var trader of [trader1, trader2]) {
    //     let [realizedPnl, unrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
    //     console.log(
    //         trader.address,
    //         'getPnlAndPendingFee',
    //         formatEther(realizedPnl),
    //         formatEther(unrealizedPnl),
    //     )
    // }

    // for (var trader of [trader1, trader2]) {
    //     await waitForTx(
    //         await vault.connect(trader).deposit(wETH.address, parseEther('990')),
    //         'await vault.connect(trader).deposit(wETH.address, parseEther(990))'
    //     )
    // }

    for (var baseToken of [vBAYC, vMAYC]) {
        let markTwapX96 = await exchange.getSqrtMarkTwapX96(baseToken.address, 0)
        let markTwap = new bn(formatSqrtPriceX96ToPrice(markTwapX96, 18))
        let indexPrice = new bn(formatEther((await baseToken.getIndexPrice(0))))
        // let deltaPrice = markTwap.minus(indexPrice).abs()
        let rndInt
        rndInt = (Math.floor(Math.random() * 1000000) % 5) + 5
        let deltaPrice = (indexPrice.multipliedBy(0.005 * rndInt))
        let tradeAmount = deltaPrice.div(indexPrice).multipliedBy(1000).div(indexPrice)
        console.log(
            baseToken.address,
            markTwap.toString(),
            indexPrice.toString(),
            deltaPrice.toString(),
            tradeAmount.toString(),
        )
        let trader: SignerWithAddress
        if (markTwap.gt(indexPrice)) {
            for (let idx = 0; idx < 10; idx++) {
                rndInt = Math.floor(Math.random() * 1000000) % 4 + 1
                if (rndInt == 1) {
                    trader = trader1
                } else if (rndInt == 2) {
                    trader = trader2
                } else if (rndInt == 3) {
                    trader = trader3
                } else if (rndInt == 4) {
                    trader = trader4
                }
                let takerOpenNotional = await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)
                console.log('takerOpenNotional short', trader.address, formatEther(takerOpenNotional))
                if (takerOpenNotional.gt(parseEther('100'))) {
                    continue
                }
                break
            }
            await waitForTx(
                await clearingHouse.connect(trader).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther(tradeAmount.toFixed(18).toString()),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                }),
                'clearingHouse.connect(trader).openPosition short'
            )
        } else {
            for (let idx = 0; idx < 10; idx++) {
                rndInt = Math.floor(Math.random() * 1000000) % 4 + 1
                if (rndInt == 1) {
                    trader = trader1
                } else if (rndInt == 2) {
                    trader = trader2
                } else if (rndInt == 3) {
                    trader = trader3
                } else if (rndInt == 4) {
                    trader = trader4
                }
                let takerOpenNotional = await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)
                console.log('takerOpenNotional long', trader.address, formatEther(takerOpenNotional))
                if (takerOpenNotional.lt(parseEther('-100'))) {
                    continue
                }
                break
            }
            await waitForTx(
                await clearingHouse.connect(trader).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther(tradeAmount.toFixed(18).toString()),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                }),
                'clearingHouse.connect(trader).openPosition long'
            )
        }
        markTwapX96 = await exchange.getSqrtMarkTwapX96(baseToken.address, 0)
        markTwap = new bn(formatSqrtPriceX96ToPrice(markTwapX96, 18))
        indexPrice = new bn(formatEther((await baseToken.getIndexPrice(0))))
        deltaPrice = markTwap.minus(indexPrice).abs()
        console.log(
            baseToken.address,
            markTwap.toString(),
            indexPrice.toString(),
            deltaPrice.toString(),
        )
    }


    // let [lastSettledTimestamp, fundingGrowth] = (await exchange.getGlobalFundingGrowthInfo(vBAYC.address))
    // console.log(
    //     'getGlobalFundingGrowthInfo',
    //     lastSettledTimestamp,
    //     fundingGrowth.twLongPremiumX96.div((new bn(2).pow(96)).toString()).toString(),
    //     fundingGrowth.twShortPremiumX96.div((new bn(2).pow(96)).toString()).toString(),
    // )
    // console.log(
    //     '(await exchange.getSqrtMarkTwapX96(vBAYC.address, 0)',
    //     formatSqrtPriceX96ToPrice((await exchange.getSqrtMarkTwapX96(vBAYC.address, 0)), 18),
    // )
    // console.log(
    //     '(await vBAYC.getIndexPrice(0)',
    //     formatEther((await vBAYC.getIndexPrice(0)).toString()),
    // )
    // console.log(
    //     'await exchange.getPendingFundingPayment(trader1.address, vBAYC.address)',
    //     formatEther((await exchange.getPendingFundingPayment(trader1.address, vBAYC.address)).toString()),
    // )
    // console.log(
    //     'await exchange.getPendingFundingPayment(trader2.address, vBAYC.address)',
    //     formatEther((await exchange.getPendingFundingPayment(trader2.address, vBAYC.address)).toString()),
    // )


    // {
    //     const poolAddr = await uniswapV3Factory.getPool(vBAYC.address, vETH.address, uniFeeTier)
    //     const uniPool = await ethers.getContractAt('UniswapV3Pool', poolAddr);
    //     await waitForTx(
    //         await uniPool.increaseObservationCardinalityNext((2 ^ 16) - 1),
    //         'await uniPool.increaseObservationCardinalityNext((2 ^ 16) - 1)'
    //     )
    // }
    // vMAYC
    // {
    //     const poolAddr = await uniswapV3Factory.getPool(vMAYC.address, vETH.address, uniFeeTier)
    //     const uniPool = await ethers.getContractAt('UniswapV3Pool', poolAddr);
    //     await waitForTx(
    //         await uniPool.increaseObservationCardinalityNext((2 ^ 16) - 1),
    //         'await uniPool.increaseObservationCardinalityNext((2 ^ 16) - 1)'
    //     )
    // }

    // {
    //     console.log(formatEther((await priceFeedBAYC.getPrice(0))))
    //     console.log(formatEther((await vBAYC.getIndexPrice(0))))
    // }
    // {
    //     console.log(formatEther((await priceFeedMAYC.getPrice(0))))
    //     console.log(formatEther((await vMAYC.getIndexPrice(0))))
    // }

    // await wETH.connect(trader).approve(vault.address, ethers.constants.MaxUint256);

    // await vault.connect(trader).deposit(wETH.address, parseEther('10'));

    // await waitForTx(
    //     await clearingHouse.connect(trader1).openPosition({
    //         baseToken: vBAYC.address,
    //         isBaseToQuote: true,
    //         isExactInput: true,
    //         oppositeAmountBound: 0,
    //         amount: parseEther("0.01"),
    //         sqrtPriceLimitX96: 0,
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     }),
    //     'clearingHouse.connect(trader).openPosition'
    // )

    // await wETH.connect(trader2).approve(vault.address, ethers.constants.MaxUint256);

    // await vault.connect(trader2).deposit(wETH.address, parseEther('10'));

    // await waitForTx(
    //     await clearingHouse.connect(trader2).openPosition({
    //         baseToken: vBAYC.address,
    //         isBaseToQuote: false,
    //         isExactInput: false,
    //         oppositeAmountBound: ethers.constants.MaxUint256,
    //         amount: parseEther("0.05"),
    //         sqrtPriceLimitX96: 0,
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     }),
    //     'clearingHouse.connect(trader).openPosition'
    // )

    // await waitForTx(
    //     await clearingHouse.connect(trader1).closePosition({
    //         baseToken: vBAYC.address,
    //         sqrtPriceLimitX96: parseEther("0"),
    //         oppositeAmountBound: parseEther("0"),
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     }),
    //     'clearingHouse.connect(trader1).closePosition'
    // )

    // await waitForTx(
    //     await exchange.connect(trader1).settleFunding(trader1.address, vBAYC.address),
    //     'exchange.connect(trader1).settleFunding(trader1.address, vBAYC.address)'
    // )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});