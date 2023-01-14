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
    const InsuranceFund = await hre.ethers.getContractFactory("InsuranceFund");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.insuranceFund.implAddress == undefined || deployData.insuranceFund.implAddress == '') {
        const insuranceFund = await waitForDeploy(await InsuranceFund.deploy())
        {
            deployData.insuranceFund.implAddress = insuranceFund.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
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
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});