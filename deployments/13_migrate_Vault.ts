import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";

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
    const Vault = await hre.ethers.getContractFactory("Vault");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.vault.implAddress == undefined || deployData.vault.implAddress == '') {
        const vault = await waitForDeploy(await Vault.deploy())
        {
            deployData.vault.implAddress = vault.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('vault is deployed', vault.address)
        }
    }
    if (deployData.vault.address == undefined || deployData.vault.address == '') {
        var vault = await hre.ethers.getContractAt('Vault', deployData.vault.implAddress);
        var initializeData = vault.interface.encodeFunctionData('initialize', [
            deployData.insuranceFund.address,
            deployData.clearingHouseConfig.address,
            deployData.accountBalance.address,
            deployData.exchange.address,
            deployData.makerFundAddress,
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.vault.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.vault.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('vault TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.vault.address, deployData.vault.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.vault.implAddress,
            [],
            {},
            "contracts/Vault.sol:Vault",
        )
    }
    {
        var vault = await hre.ethers.getContractAt('Vault', deployData.vault.implAddress);
        var initializeData = vault.interface.encodeFunctionData('initialize', [
            deployData.insuranceFund.address,
            deployData.clearingHouseConfig.address,
            deployData.accountBalance.address,
            deployData.exchange.address,
            deployData.makerFundAddress,
        ]);
        await verifyContract(
            deployData,
            network,
            deployData.vault.address,
            [
                deployData.vault.implAddress,
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