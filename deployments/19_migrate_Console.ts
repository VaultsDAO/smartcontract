import fs from "fs";

import hre, { ethers } from "hardhat";

import bn from "bignumber.js"

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, Exchange, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, TestERC20, UniswapV3Pool, Vault } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";
import BigNumber from "bignumber.js";
const { waitForTx, tryWaitForTx } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 

    const [admin, maker, priceAdmin, platformFund, trader1, trader2, trader3, trader4, hieuq] = await ethers.getSigners()

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
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

    var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

    const vETH = (await ethers.getContractAt('QuoteToken', deployData.vETH.address)) as QuoteToken;
    const vBAYC = (await ethers.getContractAt('BaseToken', deployData.vBAYC.address)) as BaseToken;
    const vMAYC = (await ethers.getContractAt('BaseToken', deployData.vMAYC.address)) as BaseToken;
    const vDOODLE = (await ethers.getContractAt('BaseToken', deployData.vDOODLE.address)) as BaseToken;

    var priceFeedBAYC = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address)) as NftPriceFeed;
    var priceFeedMAYC = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address)) as NftPriceFeed;

    var uniFeeTier = 3000 // 0.3%

    // let platformFundFeeRatio = await marketRegistry.getPlatformFundFeeRatio(vDOODLE.address)
    // console.log('getPlatformFundFeeRatio', marketRegistry.address, vDOODLE.address, platformFundFeeRatio.toString())

    let [longMultiplier, shortMultiplier] = await accountBalance.getMarketMultiplier(vBAYC.address)
    console.log('getMarketMultiplier', longMultiplier.toString(), shortMultiplier.toString())

    return

    // let totalPositionSize = await accountBalance.getTotalPositionSize('0x088D8A4a03266870EDcbbbADdA3F475f404dB9B2', vMAYC.address)
    // let totalOpenNotional = await accountBalance.getTotalOpenNotional('0x088D8A4a03266870EDcbbbADdA3F475f404dB9B2', vMAYC.address)
    // console.log('getTotalUser', formatEther(totalPositionSize), formatEther(totalOpenNotional))

    // await waitForTx(
    //     await clearingHouse.connect(hieuq).closePosition({
    //         baseToken: vMAYC.address,
    //         oppositeAmountBound: 0,
    //         sqrtPriceLimitX96: 0,
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     }),
    //     'clearingHouse.connect(hieuq).closePosition'
    // )

    // await waitForTx(
    //     await clearingHouse.connect(hieuq).openPosition({
    //         baseToken: vMAYC.address,
    //         isBaseToQuote: false,
    //         isExactInput: true,
    //         oppositeAmountBound: 0,
    //         amount: parseEther('20'),
    //         sqrtPriceLimitX96: 0,
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     }),
    //     'clearingHouse.connect(hieuq).openPosition long'
    // )

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

    // for (var trader of [trader1]) {
    //     let [realizedPnl, unrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
    //     let totalDebtValue = await accountBalance.getTotalDebtValue(trader.address)
    //     console.log(
    //         trader.address,
    //         'accountBalance',
    //         formatEther(realizedPnl),
    //         formatEther(unrealizedPnl),
    //         formatEther(totalDebtValue),
    //     )
    //     for (var baseToken of [vBAYC, vMAYC]) {
    //         let totalPositionSize = await accountBalance.getTotalPositionSize(trader.address, baseToken.address)
    //         let totalOpenNotional = await accountBalance.getTotalOpenNotional(trader.address, baseToken.address)
    //         console.log(
    //             trader.address,
    //             baseToken.address,
    //             'accountPosition',
    //             formatEther(totalPositionSize),
    //             formatEther(totalOpenNotional),
    //         )
    //     }
    // }

    // {
    //     let pfAddr = (await clearingHouse.getPlatformFund())
    //     let [realizedPnl, unrealizedPnl] = await accountBalance.getPnlAndPendingFee(pfAddr)
    //     console.log(
    //         'platformFund',
    //         pfAddr,
    //         'accountBalance',
    //         formatEther(realizedPnl),
    //         formatEther(unrealizedPnl),
    //     )
    // }

    // {
    //     let pfAddr = (await clearingHouse.getInsuranceFund())
    //     let [realizedPnl, unrealizedPnl] = await accountBalance.getPnlAndPendingFee(pfAddr)
    //     console.log(
    //         'insuranceFund',
    //         pfAddr,
    //         'accountBalance',
    //         formatEther(realizedPnl),
    //         formatEther(unrealizedPnl),
    //     )
    // }



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

    // await wETH.connect(trader4).approve(vault.address, ethers.constants.MaxUint256);

    // await vault.connect(trader4).deposit(wETH.address, parseEther('1000'));

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