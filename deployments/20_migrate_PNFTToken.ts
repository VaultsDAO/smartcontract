import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { parseEther } from "ethers/lib/utils";
import { TestERC20 } from "../typechain";

const { waitForDeploy, verifyContract, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 
    const TestERC20 = await hre.ethers.getContractFactory("TestERC20");
    // 
    if (deployData.pNFTToken.implAddress == undefined || deployData.pNFTToken.implAddress == '') {
        const pNFTToken = (await waitForDeploy(await TestERC20.deploy())) as TestERC20
        {
            deployData.pNFTToken.implAddress = pNFTToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('pNFTToken is deployed', pNFTToken.address)
        }
        await pNFTToken.__TestERC20_init(deployData.pNFTToken.name, deployData.pNFTToken.symbol, deployData.pNFTToken.decimals)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.pNFTToken.implAddress,
            [],
            {},
            "contracts/test/TestERC20.sol:TestERC20",
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });