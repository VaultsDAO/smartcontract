import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { ChainlinkPriceFeedV2 } from "../typechain"

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
    const ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.clearingHouse.implAddress == undefined || deployData.clearingHouse.implAddress == '') {
        const clearingHouse = await waitForDeploy(await ClearingHouse.deploy())
        {
            deployData.clearingHouse.implAddress = clearingHouse.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('ClearingHouse is deployed', clearingHouse.address)
        }
    }
    if (deployData.clearingHouse.address == undefined || deployData.clearingHouse.address == '') {
        var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.implAddress);
        var initializeData = clearingHouse.interface.encodeFunctionData('initialize', [
            deployData.clearingHouseConfig.address,
            deployData.vault.address,
            deployData.vUSD.address,
            deployData.uniswapV3Factory.address,
            deployData.exchange.address,
            deployData.accountBalance.address,
            deployData.insuranceFund.address,
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.clearingHouse.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.clearingHouse.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('ClearingHouse TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.clearingHouse.address, deployData.clearingHouse.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.clearingHouse.implAddress,
            [],
            {},
            "contracts/ClearingHouse.sol:ClearingHouse",
        )
    }
    {
        var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.implAddress);
        var initializeData = clearingHouse.interface.encodeFunctionData('initialize', [
            deployData.clearingHouseConfig.address,
            deployData.vault.address,
            deployData.vUSD.address,
            deployData.uniswapV3Factory.address,
            deployData.exchange.address,
            deployData.accountBalance.address,
            deployData.insuranceFund.address,
        ]);
        await verifyContract(
            deployData,
            network,
            deployData.clearingHouse.address,
            [
                deployData.clearingHouse.implAddress,
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