import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, ClearingHouseConfig, CollateralManager, Exchange, InsuranceFund, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, RewardMiner, UniswapV3Pool, Vault } from "../../typechain";
import { getMaxTickRange } from "../../test/helper/number";
import helpers from "./helpers";
import { parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deploy/mainnet/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())

    // deploy UniV3 factory
    var rewardMiner = (await hre.ethers.getContractAt('RewardMiner', deployData.rewardMiner.address)) as RewardMiner;

    // await waitForTx(
    //     await rewardMiner.startMiner(0),
    //     'rewardMiner.startMiner()'
    // )
    // await waitForTx(
    //     await rewardMiner.startPnlMiner(1, 666666),
    //     'rewardMiner.startPnlMiner(1, 666666)'
    // )

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});