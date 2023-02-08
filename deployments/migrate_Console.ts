import fs from "fs";

import bn from "bignumber.js"

import hre, { ethers } from "hardhat";

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, ClearingHouseConfig, CollateralManager, Exchange, InsuranceFund, MarketRegistry, MockPNFTToken, NftPriceFeed, OrderBook, QuoteToken, RewardMiner, UniswapV3Pool, Vault } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { formatEther, parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;

import migrateRewardMiner from "./21_migrate_RewardMiner";


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {

    {
        console.log('migrateRewardMiner -- START --')
        await migrateRewardMiner();
        console.log('migrateRewardMiner -- END --')
    }
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

    // check start
    {
        let startTime = rewardMiner.getStart()
    }
    // get current period info
    {
        const [
            periodNumber,
            start,
            end,
            total,
            amount,
        ] = await rewardMiner.getCurrentPeriodInfo();
        console.log(
            'getCurrentPeriodInfo',
            (periodNumber).toString(),
            (start).toString(),
            (end).toString(),
            formatEther(total),
            formatEther(amount),
        )
    }
    // get current period info and trader amount
    {
        const [
            periodNumber,
            start,
            end,
            total,
            amount,
            traderAmount,
        ] = await rewardMiner.getCurrentPeriodInfoTrader('0x088D8A4a03266870EDcbbbADdA3F475f404dB9B2');
        console.log(
            'getCurrentPeriodInfoTrader',
            (periodNumber).toString(),
            (start).toString(),
            (end).toString(),
            formatEther(total),
            formatEther(amount),
            formatEther(traderAmount),
        )
    }

    console.log(
        'getClaimable 0x088D8A4a03266870EDcbbbADdA3F475f404dB9B2',
        formatEther(await rewardMiner.getClaimable('0x088D8A4a03266870EDcbbbADdA3F475f404dB9B2'))
    )

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