import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { parseEther } from "ethers/lib/utils";
import { MockPNFTToken } from "../typechain";

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
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    const MockPNFTToken = await hre.ethers.getContractFactory("MockPNFTToken");

    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);

    // 
    if (deployData.pNFTToken.implAddress == undefined || deployData.pNFTToken.implAddress == '') {
        const pNFTToken = (await waitForDeploy(await MockPNFTToken.deploy())) as MockPNFTToken
        {
            deployData.pNFTToken.implAddress = pNFTToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('pNFTToken is deployed', pNFTToken.address)
        }
        await pNFTToken.__MockPNFTToken_init(deployData.pNFTToken.name, deployData.pNFTToken.symbol, deployData.pNFTToken.decimals)
    }
    if (deployData.pNFTToken.address == undefined || deployData.pNFTToken.address == '') {
        var pNFTToken = await hre.ethers.getContractAt('MockPNFTToken', deployData.pNFTToken.implAddress);
        var initializeData = pNFTToken.interface.encodeFunctionData('__MockPNFTToken_init', [
            deployData.pNFTToken.name,
            deployData.pNFTToken.symbol,
            deployData.pNFTToken.decimals
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.pNFTToken.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.pNFTToken.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('pNFTToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.pNFTToken.implAddress,
            [],
            {},
            "contracts/test/MockPNFTToken.sol:MockPNFTToken",
        )
    }
    {
        var pNFTToken = await hre.ethers.getContractAt('MockPNFTToken', deployData.pNFTToken.implAddress);
        var initializeData = pNFTToken.interface.encodeFunctionData('__MockPNFTToken_init', [
            deployData.pNFTToken.name,
            deployData.pNFTToken.symbol,
            deployData.pNFTToken.decimals
        ]);
        await verifyContract(
            deployData,
            network,
            deployData.testFaucet.address,
            [
                deployData.testFaucet.implAddress,
                proxyAdmin.address,
                initializeData,
            ],
            {},
            "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });