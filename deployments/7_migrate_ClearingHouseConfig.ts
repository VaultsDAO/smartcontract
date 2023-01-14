import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";

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
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    const ClearingHouseConfig = await hre.ethers.getContractFactory("ClearingHouseConfig");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.clearingHouseConfig.implAddress == undefined || deployData.clearingHouseConfig.implAddress == '') {
        const clearingHouseConfig = await waitForDeploy(await ClearingHouseConfig.deploy())
        {
            deployData.clearingHouseConfig.implAddress = clearingHouseConfig.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('clearingHouseConfig is deployed', clearingHouseConfig.address)
        }
    }
    if (deployData.clearingHouseConfig.address == undefined || deployData.clearingHouseConfig.address == '') {
        var clearingHouseConfig = await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.implAddress);
        var initializeData = clearingHouseConfig.interface.encodeFunctionData('initialize', []);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.clearingHouseConfig.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.clearingHouseConfig.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('clearingHouseConfig TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.clearingHouseConfig.address, deployData.clearingHouseConfig.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.clearingHouseConfig.implAddress,
            [],
            {},
            "contracts/ClearingHouseConfig.sol:ClearingHouseConfig",
        )
    }
    {
        var clearingHouseConfig = await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.implAddress);
        var initializeData = clearingHouseConfig.interface.encodeFunctionData('initialize', []);
        await verifyContract(
            deployData,
            network,
            deployData.clearingHouseConfig.address,
            [
                deployData.clearingHouseConfig.implAddress,
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});