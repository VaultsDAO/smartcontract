import { formatEther, parseEther } from "ethers/lib/utils";
import fs from "fs";

import hre from "hardhat";
import { NftPriceFeed } from "../../typechain";
import helpers from "../helpers";

const {  waitForDeploy, verifyContract, loadDB, saveDB, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 
    // if (deployData.priceFeedETH.address == undefined || deployData.priceFeedETH.address == '') {
    //     if (network == 'local') {
    //         if (deployData.priceFeedETH.aggregatorAddress == undefined || deployData.priceFeedETH.aggregatorAddress == '') {
    //             const aggregatorFactory = await hre.ethers.getContractFactory("TestAggregatorV3")
    //             const aggregator = await waitForDeploy(await aggregatorFactory.deploy())
    //             {
    //                 deployData.priceFeedETH.aggregatorAddress = aggregator.address
    //                 deployData = (await saveDB(network, deployData))
    //                 console.log('TestAggregatorV3 is deployed', aggregator.address)
    //             }
    //         }
    //     }
    //     const chainlinkPriceFeedFactory = await hre.ethers.getContractFactory("ChainlinkPriceFeedV2")
    //     const priceFeed = await waitForDeploy(await chainlinkPriceFeedFactory.deploy(deployData.priceFeedETH.aggregatorAddress, cacheTwapInterval))
    //     {
    //         deployData.priceFeedETH.address = priceFeed.address
    //         deployData = (await saveDB(network, deployData))
    //         console.log('ChainlinkPriceFeedV2 is deployed', priceFeed.address)
    //     }
    // }
    // if (deployData.priceFeedBTC.address == undefined || deployData.priceFeedBTC.address == '') {
    //     if (network == 'local') {
    //         if (deployData.priceFeedBTC.aggregatorAddress == undefined || deployData.priceFeedBTC.aggregatorAddress == '') {
    //             const aggregatorFactory = await hre.ethers.getContractFactory("TestAggregatorV3")
    //             const aggregator = await waitForDeploy(await aggregatorFactory.deploy())
    //             {
    //                 deployData.priceFeedBTC.aggregatorAddress = aggregator.address
    //                 deployData = (await saveDB(network, deployData))
    //                 console.log('TestAggregatorV3 is deployed', aggregator.address)
    //             }
    //         }
    //     }
    //     const chainlinkPriceFeedFactory = await hre.ethers.getContractFactory("ChainlinkPriceFeedV2")
    //     const priceFeed = await waitForDeploy(await chainlinkPriceFeedFactory.deploy(deployData.priceFeedBTC.aggregatorAddress, cacheTwapInterval))
    //     {
    //         deployData.priceFeedBTC.address = priceFeed.address
    //         deployData = (await saveDB(network, deployData))
    //         console.log('ChainlinkPriceFeedV2 is deployed', priceFeed.address)
    //     }
    // }
    // {
    //     await verifyContract(
    //         deployData,
    //         network,
    //         deployData.priceFeedETH.address,
    //         [deployData.priceFeedETH.aggregatorAddress, cacheTwapInterval],
    //         {},
    //         "@perp/perp-oracle-contract/contracts/ChainlinkPriceFeedV2.sol:ChainlinkPriceFeedV2",
    //     )
    // }
    // {
    //     await verifyContract(
    //         deployData,
    //         network,
    //         deployData.priceFeedBTC.address,
    //         [deployData.priceFeedBTC.aggregatorAddress, cacheTwapInterval],
    //         {},
    //         "@perp/perp-oracle-contract/contracts/ChainlinkPriceFeedV2.sol:ChainlinkPriceFeedV2",
    //     )
    // }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });