import { formatEther, parseEther } from "ethers/lib/utils";
import fs from "fs";

import hre from "hardhat";
import { NftPriceFeed } from "../typechain";
import helpers from "./helpers";

const { waitForDeploy, verifyContract, upgradeContract } = helpers;

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
    // if (deployData.priceFeedETH.address == undefined || deployData.priceFeedETH.address == '') {
    //     if (network == 'local') {
    //         if (deployData.priceFeedETH.aggregatorAddress == undefined || deployData.priceFeedETH.aggregatorAddress == '') {
    //             const aggregatorFactory = await hre.ethers.getContractFactory("TestAggregatorV3")
    //             const aggregator = await waitForDeploy(await aggregatorFactory.deploy())
    //             {
    //                 deployData.priceFeedETH.aggregatorAddress = aggregator.address
    //                 await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
    //                 console.log('TestAggregatorV3 is deployed', aggregator.address)
    //             }
    //         }
    //     }
    //     const chainlinkPriceFeedFactory = await hre.ethers.getContractFactory("ChainlinkPriceFeedV2")
    //     const priceFeed = await waitForDeploy(await chainlinkPriceFeedFactory.deploy(deployData.priceFeedETH.aggregatorAddress, cacheTwapInterval))
    //     {
    //         deployData.priceFeedETH.address = priceFeed.address
    //         await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
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
    //                 await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
    //                 console.log('TestAggregatorV3 is deployed', aggregator.address)
    //             }
    //         }
    //     }
    //     const chainlinkPriceFeedFactory = await hre.ethers.getContractFactory("ChainlinkPriceFeedV2")
    //     const priceFeed = await waitForDeploy(await chainlinkPriceFeedFactory.deploy(deployData.priceFeedBTC.aggregatorAddress, cacheTwapInterval))
    //     {
    //         deployData.priceFeedBTC.address = priceFeed.address
    //         await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});