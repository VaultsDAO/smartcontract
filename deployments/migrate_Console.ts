import fs from "fs";

import bn from "bignumber.js"

import hre, { ethers } from "hardhat";

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, ClearingHouseConfig, CollateralManager, Exchange, InsuranceFund, MarketRegistry, MockPNFTToken, NftPriceFeed, OrderBook, QuoteToken, RewardMiner, TestFaucet, UniswapV3Pool, Vault } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { formatEther, parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;

import migrateAdmin from "./1_migrate_Admin";
import migratePriceFeedAll from "./2_migrate_PriceFeed_All";
import migrateTokens from "./3_migrate_Tokens";
import migrateQuoteToken from "./4_migrate_QuoteToken";
import migrateBaseTokenAll from "./5_migrate_BaseToken_All";
import migrateLibrary from "./6_migrate_Library";
import migrateUniswapV3 from "./6_migrate_UniswapV3";
import migrateClearingHouseConfig from "./7_migrate_ClearingHouseConfig";
import migrateMarketRegistry from "./8_migrate_MarketRegistry";
import migrateOrderBook from "./9_migrate_OrderBook";
import migrateAccountBalance from "./10_migrate_AccountBalance";
import migrateExchange from "./11_migrate_Exchange";
import migrateInsuranceFund from "./12_migrate_InsuranceFund";
import migrateVault from "./13_migrate_Vault";
import migrateCollateralManager from "./14_migrate_CollateralManager";
import migrateClearingHouse from "./15_migrate_ClearingHouse";
import migratePNFTToken from "./20_migrate_PNFTToken";
import migrateRewardMiner from "./21_migrate_RewardMiner";


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {

    {
        console.log('migrateExchange -- START --')
        await migrateExchange();
        console.log('migrateExchange -- END --')
    }
    // {
    //     console.log('migrateLibrary -- START --')
    //     await migrateLibrary();
    //     console.log('migrateLibrary -- END --')
    // }
    // {
    //     console.log('migrateClearingHouse -- START --')
    //     await migrateClearingHouse();
    //     console.log('migrateClearingHouse -- END --')
    // }
    // {
    //     console.log('migrateRewardMiner -- START --')
    //     await migrateRewardMiner();
    //     console.log('migrateRewardMiner -- END --')
    // }
    return


    const network = hre.network.name;
    let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())

    // deploy UniV3 factory
    var clearingHouseConfig = (await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address)) as ClearingHouseConfig;
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = (await hre.ethers.getContractAt('Exchange', deployData.exchange.address) as Exchange);
    var insuranceFund = (await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address)) as InsuranceFund;
    var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
    var collateralManager = (await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address)) as CollateralManager;
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;
    var rewardMiner = (await hre.ethers.getContractAt('RewardMiner', deployData.rewardMiner.address)) as RewardMiner;
    var pNFTToken = (await hre.ethers.getContractAt('MockPNFTToken', deployData.pNFTToken.address)) as MockPNFTToken;
    var testFaucet = (await hre.ethers.getContractAt('TestFaucet', deployData.testFaucet.address)) as TestFaucet;


    var baseTokenAddr = deployData.vMOONBIRD.address

    let markTwapX96 = await exchange.getSqrtMarkTwapX96(baseTokenAddr, 0)
    let markTwap = new bn(formatSqrtPriceX96ToPrice(markTwapX96, 18))
    console.log(
        'markTwap',
        markTwap.toString()
    )

    // var isAbleRepeg = (await clearingHouse.isAbleRepeg(baseTokenAddr))
    // console.log(
    //     'isAbleRepeg',
    //     isAbleRepeg
    // )
    // if (isAbleRepeg) {
    //     waitForTx(
    //         await clearingHouse.repeg(baseTokenAddr),
    //         'clearingHouse.repeg(' + baseTokenAddr + ')'
    //     )
    // }

    // console.log(
    //     await testFaucet.isFaucet('0xFC3d83536a44f13F6266C8607C5B62E62C058c0e')
    // )
    // return


    // var address = '0x088d8a4a03266870edcbbbadda3f475f404db9b2'
    // let [realizedPnl, unrealizedPnl] = await accountBalance.getPnlAndPendingFee(address)
    // console.log(
    //     'isLiquidatable',
    //     address,
    //     formatEther(realizedPnl),
    //     formatEther(unrealizedPnl),
    //     formatEther(await vault.getAccountValue(address)),
    //     formatEther(await accountBalance.getMarginRequirementForLiquidation(address)),
    //     formatEther(await accountBalance.getTotalPositionSize(address, deployData.vBAYC.address)),
    //     formatEther(await accountBalance.getTotalPositionValue(address, deployData.vBAYC.address)),
    // )

    // {
    //     var vBAYC = (await hre.ethers.getContractAt('BaseToken', deployData.vBAYC.address)) as BaseToken;
    //     let currPriceX96 = await exchange.getSqrtMarkTwapX96(vBAYC.address, 0)
    //     let currPrice = new bn(formatSqrtPriceX96ToPrice(currPriceX96, 18))
    //     var isBaseToQuote = true;
    //     let estimateSwap = await exchange.estimateSwap({
    //         baseToken: vBAYC.address,
    //         isBaseToQuote: isBaseToQuote,
    //         isExactInput: !isBaseToQuote,
    //         oppositeAmountBound: 0,
    //         amount: parseEther("10"),
    //         sqrtPriceLimitX96: parseEther("0"),
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     })
    //     let newPrice: bn;
    //     if (isBaseToQuote) {
    //         newPrice = new bn(estimateSwap.amountOut.toString()).div(new bn(estimateSwap.amountIn.toString()))
    //     } else {
    //         newPrice = new bn(estimateSwap.amountIn.toString()).div(new bn(estimateSwap.amountOut.toString()))
    //     }
    //     console.log(
    //         'newPrice',
    //         currPrice.toString(),
    //         newPrice.toString(),
    //     )
    // }

    // // check start
    // {
    //     let startTime = rewardMiner.getStart()
    // }
    // // get current period info
    // {
    //     const [
    //         periodNumber,
    //         start,
    //         end,
    //         total,
    //         amount,
    //     ] = await rewardMiner.getCurrentPeriodInfo();
    //     console.log(
    //         'getCurrentPeriodInfo',
    //         (periodNumber).toString(),
    //         (start).toString(),
    //         (end).toString(),
    //         formatEther(total),
    //         formatEther(amount),
    //     )
    // }
    // // get current period info and trader amount
    // {
    //     const [
    //         periodNumber,
    //         start,
    //         end,
    //         total,
    //         amount,
    //         traderAmount,
    //     ] = await rewardMiner.getCurrentPeriodInfoTrader('0x088D8A4a03266870EDcbbbADdA3F475f404dB9B2');
    //     console.log(
    //         'getCurrentPeriodInfoTrader',
    //         (periodNumber).toString(),
    //         (start).toString(),
    //         (end).toString(),
    //         formatEther(total),
    //         formatEther(amount),
    //         formatEther(traderAmount),
    //     )
    // }

    // console.log(
    //     'getClaimable 0x4e623cde68aefe0a92907ee7eef03d96f76ef584',
    //     formatEther(await rewardMiner.getClaimable('0x4e623cde68aefe0a92907ee7eef03d96f76ef584'))
    // )

    // if ((await clearingHouse.getRewardMiner()).toLowerCase() != rewardMiner.address.toLowerCase()) {
    //     await waitForTx(
    //         await clearingHouse.setRewardMiner(rewardMiner.address), 'clearingHouse.setRewardMiner(rewardMiner.address)'
    //     )
    // }

    // await waitForTx(
    //     await rewardMiner.startMiner('1675826100'), 'rewardMiner.startMiner()'
    // )

    // await pNFTToken.mint(rewardMiner.address, parseEther('9000000'));

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});