import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../../typechain/openzeppelin/ProxyAdmin";

const { waitForDeploy, verifyContract, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deploy/mainnet/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    const AccountBalance = await hre.ethers.getContractFactory("AccountBalance");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.accountBalance.implAddress == undefined || deployData.accountBalance.implAddress == '') {
        const accountBalance = await waitForDeploy(await AccountBalance.deploy())
        {
            deployData.accountBalance.implAddress = accountBalance.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('accountBalance is deployed', accountBalance.address)
        }
    }
    if (deployData.accountBalance.address == undefined || deployData.accountBalance.address == '') {
        var accountBalance = await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.implAddress);
        var initializeData = accountBalance.interface.encodeFunctionData('initialize', [deployData.clearingHouseConfig.address, deployData.orderBook.address]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.accountBalance.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.accountBalance.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('accountBalance TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.accountBalance.address, deployData.accountBalance.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.accountBalance.implAddress,
            [],
            {},
            "contracts/AccountBalance.sol:AccountBalance",
        )
    }
    {
        var accountBalance = await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.implAddress);
        var initializeData = accountBalance.interface.encodeFunctionData('initialize', [deployData.clearingHouseConfig.address, deployData.orderBook.address]);
        await verifyContract(
            deployData,
            network,
            deployData.accountBalance.address,
            [
                deployData.accountBalance.implAddress,
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