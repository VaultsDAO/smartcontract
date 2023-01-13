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
    const BaseToken = await hre.ethers.getContractFactory("BaseToken");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.baseToken.implAddress == undefined || deployData.baseToken.implAddress == '') {
        let baseToken = await waitForDeploy(await BaseToken.deploy());
        {
            deployData.baseToken.implAddress = baseToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('BaseToken is deployed', baseToken.address)
        }
    }
    var baseToken = await hre.ethers.getContractAt('BaseToken', deployData.baseToken.implAddress);
    if (deployData.vBAYC.address == undefined || deployData.vBAYC.address == '') {
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vBAYC.name, deployData.vBAYC.symbol, deployData.nftPriceFeedBAYC.address]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                baseToken.address,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.vBAYC.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('BaseToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    if (deployData.vMAYC.address == undefined || deployData.vMAYC.address == '') {
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vMAYC.name, deployData.vMAYC.symbol, deployData.nftPriceFeedMAYC.address]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                baseToken.address,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.vMAYC.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('BaseToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.vBAYC.address, deployData.baseToken.implAddress)
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.vMAYC.address, deployData.baseToken.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.baseToken.implAddress,
            [],
            {},
            "contracts/BaseToken.sol:BaseToken",
        )
    }
    {
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vBAYC.name, deployData.vBAYC.symbol, deployData.nftPriceFeedBAYC.address]);
        await verifyContract(
            deployData,
            network,
            deployData.vBAYC.address,
            [
                baseToken.address,
                proxyAdmin.address,
                initializeData,
            ],
            {},
            "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
        )
    }
    {
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vMAYC.name, deployData.vMAYC.symbol, deployData.nftPriceFeedMAYC.address]);
        await verifyContract(
            deployData,
            network,
            deployData.vMAYC.address,
            [
                baseToken.address,
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