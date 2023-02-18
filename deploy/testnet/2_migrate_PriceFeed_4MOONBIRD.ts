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
    if (deployData.nftPriceFeedMOONBIRD.address == undefined || deployData.nftPriceFeedMOONBIRD.address == '') {
        const NftPriceFeed = await hre.ethers.getContractFactory("NftPriceFeed")
        const priceFeed = (await waitForDeploy(await NftPriceFeed.deploy(deployData.nftPriceFeedMOONBIRD.symbol))) as NftPriceFeed
        {
            deployData.nftPriceFeedMOONBIRD.address = priceFeed.address
            deployData = (await saveDB(network, deployData))
            console.log('nftPriceFeed is deployed', priceFeed.address)
        }
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.nftPriceFeedMOONBIRD.address,
            [deployData.nftPriceFeedMOONBIRD.symbol],
            {},
            "contracts/oracle/NftPriceFeed.sol:NftPriceFeed",
        )
    }
}

// // We recommend this pattern to be able to use async/await everywhere
// // and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });