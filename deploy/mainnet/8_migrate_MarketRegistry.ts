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
    const MarketRegistry = await hre.ethers.getContractFactory("MarketRegistry");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.marketRegistry.implAddress == undefined || deployData.marketRegistry.implAddress == '') {
        const marketRegistry = await waitForDeploy(await MarketRegistry.deploy())
        {
            deployData.marketRegistry.implAddress = marketRegistry.address;
            deployData = (await saveDB(network, deployData))
            console.log('marketRegistry is deployed', marketRegistry.address)
        }
    }
    if (deployData.marketRegistry.address == undefined || deployData.marketRegistry.address == '') {
        var marketRegistry = await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.implAddress);
        var initializeData = marketRegistry.interface.encodeFunctionData('initialize', [deployData.uniswapV3Factory.address, deployData.vETH.address]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.marketRegistry.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.marketRegistry.address = transparentUpgradeableProxy.address;
            deployData = (await saveDB(network, deployData))
            console.log('marketRegistry TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.marketRegistry.address, deployData.marketRegistry.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.marketRegistry.implAddress,
            [],
            {},
            "contracts/MarketRegistry.sol:MarketRegistry",
        )
    }
    {
        var marketRegistry = await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.implAddress);
        var initializeData = marketRegistry.interface.encodeFunctionData('initialize', [deployData.uniswapV3Factory.address, deployData.vETH.address]);
        await verifyContract(
            deployData,
            network,
            deployData.marketRegistry.address,
            [
                deployData.marketRegistry.implAddress,
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