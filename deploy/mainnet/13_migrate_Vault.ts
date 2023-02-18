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
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.vault.implAddress == undefined || deployData.vault.implAddress == '') {
        var vaultLogic = await hre.ethers.getContractAt('VaultLogic', deployData.vaultLogic.address);
        let Vault = await hre.ethers.getContractFactory("Vault", {
            libraries: {
                VaultLogic: vaultLogic.address,
            },
        });
        const vault = await waitForDeploy(await Vault.deploy())
        {
            deployData.vault.implAddress = vault.address;
            deployData = (await saveDB(network, deployData))
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
            deployData = (await saveDB(network, deployData))
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
            {
                VaultLogic: deployData.vaultLogic.address,
            },
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