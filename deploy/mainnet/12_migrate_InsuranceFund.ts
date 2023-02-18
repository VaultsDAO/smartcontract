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
    const InsuranceFund = await hre.ethers.getContractFactory("InsuranceFund");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.insuranceFund.implAddress == undefined || deployData.insuranceFund.implAddress == '') {
        const insuranceFund = await waitForDeploy(await InsuranceFund.deploy())
        {
            deployData.insuranceFund.implAddress = insuranceFund.address;
            deployData = (await saveDB(network, deployData))
            console.log('insuranceFund is deployed', insuranceFund.address)
        }
    }
    if (deployData.insuranceFund.address == undefined || deployData.insuranceFund.address == '') {
        var insuranceFund = await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.implAddress);
        var initializeData = insuranceFund.interface.encodeFunctionData('initialize', [deployData.wETH.address]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.insuranceFund.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.insuranceFund.address = transparentUpgradeableProxy.address;
            deployData = (await saveDB(network, deployData))
            console.log('insuranceFund TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.insuranceFund.address, deployData.insuranceFund.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.insuranceFund.implAddress,
            [],
            {},
            "contracts/InsuranceFund.sol:InsuranceFund",
        )
    }
    {
        var insuranceFund = await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.implAddress);
        var initializeData = insuranceFund.interface.encodeFunctionData('initialize', [deployData.wETH.address]);
        await verifyContract(
            deployData,
            network,
            deployData.insuranceFund.address,
            [
                deployData.insuranceFund.implAddress,
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