import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../test/shared/utilities";
import { AccountBalance, BaseToken, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, UniswapV3Pool } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { formatEther, parseEther } from "ethers/lib/utils";
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

    const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()

    // deploy UniV3 factory
    var uniswapV3Factory = await hre.ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
    var clearingHouseConfig = await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address);
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = await hre.ethers.getContractAt('Exchange', deployData.exchange.address);
    var insuranceFund = await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address);
    var vault = await hre.ethers.getContractAt('Vault', deployData.vault.address);
    var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address);
    var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);

    const vETH = (await ethers.getContractAt('QuoteToken', deployData.vETH.address)) as QuoteToken;
    const vBAYC = (await ethers.getContractAt('BaseToken', deployData.vBAYC.address)) as BaseToken;
    const vMAYC = (await ethers.getContractAt('BaseToken', deployData.vMAYC.address)) as BaseToken;

    var priceFeedBAYC = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address)) as NftPriceFeed;
    var priceFeedMAYC = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address)) as NftPriceFeed;

    {
        console.log(formatEther((await priceFeedBAYC.getPrice(0))))
        console.log(formatEther((await vBAYC.getIndexPrice(0))))
    }
    {
        console.log(formatEther((await priceFeedMAYC.getPrice(0))))
        console.log(formatEther((await vMAYC.getIndexPrice(0))))
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});