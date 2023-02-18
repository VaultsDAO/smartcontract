import fs from "fs";

import hre from "hardhat";
import helpers from "../helpers";

import { ProxyAdmin } from "../../typechain/openzeppelin/ProxyAdmin";

const {  waitForDeploy, verifyContract, loadDB, saveDB, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
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
            deployData = (await saveDB(network, deployData))
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
            deployData = (await saveDB(network, deployData))
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
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });