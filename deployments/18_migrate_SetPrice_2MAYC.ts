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

    var nftPriceFeedAddress = deployData.nftPriceFeedMAYC.address
    var price = '14'
    if (network == 'local') {
        price = "100"
    }
    // oracle price
    {
        var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', nftPriceFeedAddress)) as NftPriceFeed;
        await waitForTx(
            await priceFeed.connect(priceAdmin).setPrice(parseEther(price))
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});