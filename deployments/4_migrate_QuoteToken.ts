import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { isAscendingTokenOrder } from "../test/shared/utilities";

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
    let TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    let QuoteToken = await hre.ethers.getContractFactory("QuoteToken");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.vETH.implAddress == undefined || deployData.vETH.implAddress == '') {
        let quoteToken = await waitForDeploy(await QuoteToken.deploy());
        {
            deployData.vETH.implAddress = quoteToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('quoteToken is deployed', quoteToken.address)
        }
    }
    // 
    if (deployData.vETH.address == undefined || deployData.vETH.address == '') {
        var quoteToken = await hre.ethers.getContractAt('QuoteToken', deployData.vETH.implAddress);
        var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.vETH.name, deployData.vETH.symbol]);
        for (let i = 0; i < 32; i++) {
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.vETH.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            )
            if (deployData.vETH.address == undefined ||
                deployData.vETH.address == '' ||
                isAscendingTokenOrder(deployData.vETH.address, transparentUpgradeableProxy.address.toString())) {
                deployData.vETH.address = transparentUpgradeableProxy.address;
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('vETH TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
            }
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.vETH.address, deployData.vETH.implAddress)
    }
    // 
    {
        await verifyContract(
            deployData,
            network,
            deployData.vETH.implAddress,
            [],
            {},
            "contracts/QuoteToken.sol:QuoteToken",
        )
    }
    {
        var quoteToken = await hre.ethers.getContractAt('QuoteToken', deployData.vETH.implAddress);
        var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.vETH.name, deployData.vETH.symbol]);
        await verifyContract(
            deployData,
            network,
            deployData.vETH.address,
            [
                deployData.vETH.implAddress,
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