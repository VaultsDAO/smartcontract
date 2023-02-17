import { formatEther, parseEther } from "ethers/lib/utils";
import fs from "fs";

import hre from "hardhat";
import { NftPriceFeed } from "../../typechain";
import helpers from "./helpers";

const { waitForDeploy, verifyContract, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deploy/testnet/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    if (deployData.nftPriceFeedBAYC.address == undefined || deployData.nftPriceFeedBAYC.address == '') {
        const NftPriceFeed = await hre.ethers.getContractFactory("NftPriceFeed")
        const priceFeed = (await waitForDeploy(await NftPriceFeed.deploy(deployData.nftPriceFeedBAYC.symbol))) as NftPriceFeed
        {
            deployData.nftPriceFeedBAYC.address = priceFeed.address
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('nftPriceFeed is deployed', priceFeed.address)
        }
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.nftPriceFeedBAYC.address,
            [deployData.nftPriceFeedBAYC.symbol],
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