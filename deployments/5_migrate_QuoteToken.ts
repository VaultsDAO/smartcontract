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
    let TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    let QuoteToken = await hre.ethers.getContractFactory("QuoteToken");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.quoteToken.implAddress == undefined || deployData.quoteToken.implAddress == '') {
        let quoteToken = await waitForDeploy(await QuoteToken.deploy());
        {
            deployData.quoteToken.implAddress = quoteToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('QuoteToken is deployed', quoteToken.address)
        }
    }
    // 
    if (deployData.quoteToken.address == undefined || deployData.quoteToken.address == '') {
        var quoteToken = await hre.ethers.getContractAt('QuoteToken', deployData.quoteToken.implAddress);
        var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.quoteToken.name, deployData.quoteToken.symbol]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.quoteToken.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.quoteToken.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('QuoteToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.quoteToken.address, deployData.quoteToken.implAddress)
    }
    // 
    {
        await verifyContract(
            deployData,
            network,
            deployData.quoteToken.implAddress,
            [],
            {},
            "contracts/QuoteToken.sol:QuoteToken",
        )
    }
    {
        var quoteToken = await hre.ethers.getContractAt('QuoteToken', deployData.quoteToken.implAddress);
        var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.quoteToken.name, deployData.quoteToken.symbol]);
        await verifyContract(
            deployData,
            network,
            deployData.quoteToken.address,
            [
                deployData.quoteToken.implAddress,
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