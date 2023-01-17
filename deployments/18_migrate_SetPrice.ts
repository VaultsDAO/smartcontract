import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../test/shared/utilities";
import { AccountBalance, BaseToken, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, UniswapV3Pool } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { parseEther } from "ethers/lib/utils";
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
    // oracle price
    {
        var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address)) as NftPriceFeed;
        if ((await priceFeed.priceFeedAdmin()).toLowerCase() != priceAdmin.address.toLowerCase()) {
            await waitForTx(
                await priceFeed.setPriceFeedAdmin(priceAdmin.address)
            )
        } 
        await waitForTx(
            await priceFeed.connect(priceAdmin).setPrice(parseEther('73.8388'))
        )
    }
    {
        var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address)) as NftPriceFeed;
        if ((await priceFeed.priceFeedAdmin()).toLowerCase() != priceAdmin.address.toLowerCase()) {
            await waitForTx(
                await priceFeed.setPriceFeedAdmin(priceAdmin.address)
            )
        }
        await waitForTx(
            await priceFeed.connect(priceAdmin).setPrice(parseEther('15.899'))
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});