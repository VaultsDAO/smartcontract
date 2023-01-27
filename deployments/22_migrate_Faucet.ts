import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { parseEther } from "ethers/lib/utils";

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
    const TestFaucet = await hre.ethers.getContractFactory("TestFaucet");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.testFaucet.implAddress == undefined || deployData.testFaucet.implAddress == '') {
        const testFaucet = await waitForDeploy(await TestFaucet.deploy())
        {
            deployData.testFaucet.implAddress = testFaucet.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('testFaucet is deployed', testFaucet.address)
        }
    }
    if (deployData.testFaucet.address == undefined || deployData.testFaucet.address == '') {
        var testFaucet = await hre.ethers.getContractAt('TestFaucet', deployData.testFaucet.implAddress);
        var initializeData = testFaucet.interface.encodeFunctionData('initialize', [
            deployData.vault.address,
            deployData.wETH.address,
            parseEther('5'),
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.testFaucet.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.testFaucet.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('testFaucet TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.testFaucet.address, deployData.testFaucet.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.testFaucet.implAddress,
            [],
            {},
            "contracts/test/TestFaucet.sol:TestFaucet",
        )
    }
    {
        var testFaucet = await hre.ethers.getContractAt('TestFaucet', deployData.testFaucet.implAddress);
        var initializeData = testFaucet.interface.encodeFunctionData('initialize', [
            deployData.vault.address,
            deployData.wETH.address,
            parseEther('5'),
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});