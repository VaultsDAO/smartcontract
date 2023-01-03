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
    if (deployData.vUSD.implAddress == undefined || deployData.vUSD.implAddress == '') {
        let quoteToken = await waitForDeploy(await QuoteToken.deploy());
        {
            deployData.vUSD.implAddress = quoteToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('QuoteToken is deployed', quoteToken.address)
        }
    }
    // 
    if (deployData.vUSD.address == undefined || deployData.vUSD.address == '') {
        var quoteToken = await hre.ethers.getContractAt('QuoteToken', deployData.vUSD.implAddress);
        var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.vUSD.name, deployData.vUSD.symbol]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.vUSD.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.vUSD.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('QuoteToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.vUSD.address, deployData.vUSD.implAddress)
    }
    // 
    {
        await verifyContract(
            deployData,
            network,
            deployData.vUSD.implAddress,
            [],
            {},
            "contracts/QuoteToken.sol:QuoteToken",
        )
    }
    {
        var quoteToken = await hre.ethers.getContractAt('QuoteToken', deployData.vUSD.implAddress);
        var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.vUSD.name, deployData.vUSD.symbol]);
        await verifyContract(
            deployData,
            network,
            deployData.vUSD.address,
            [
                deployData.vUSD.implAddress,
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