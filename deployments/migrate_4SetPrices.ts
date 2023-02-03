import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../test/shared/utilities";
import { AccountBalance, BaseToken, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, UniswapV3Pool } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
    let deployData: DeployData;
    {
        if (!(await fs.existsSync(fileName))) {
            throw 'deployed file is not existsed'
        }
        let dataText = await fs.readFileSync(fileName)
        deployData = JSON.parse(dataText.toString())
    }
    let priceData: PriceData;
    {
        let dataText = await fs.readFileSync(process.cwd() + '/deployments/address/prices.json')
        priceData = JSON.parse(dataText.toString())
    }
    // 
    const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()

    let nftPriceFeeds = [
        deployData.nftPriceFeedBAYC,
        deployData.nftPriceFeedMAYC,
        deployData.nftPriceFeedCRYPTOPUNKS,
        deployData.nftPriceFeedMOONBIRD,
        deployData.nftPriceFeedAZUKI,
        deployData.nftPriceFeedCLONEX,
        deployData.nftPriceFeedDOODLE,
    ];
    let priceKeys = [
        'priceBAYC',
        'priceMAYC',
        'priceCRYPTOPUNKS',
        'priceMOONBIRD',
        'priceAZUKI',
        'priceCLONEX',
        'priceDOODLE'
    ];
    for (let i = 0; i < nftPriceFeeds.length; i++) {
        var nftPriceFeedAddress = nftPriceFeeds[i].address
        var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', nftPriceFeedAddress)) as NftPriceFeed;
        await waitForTx(
            await priceFeed.connect(priceAdmin).setPrice(parseEther(priceData[priceKeys[i]])),
            'await priceFeed.connect(priceAdmin).setPrice(' + priceData[priceKeys[i]] + ')',
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});