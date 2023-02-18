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
    const OrderBook = await hre.ethers.getContractFactory("OrderBook");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.orderBook.implAddress == undefined || deployData.orderBook.implAddress == '') {
        const orderBook = await waitForDeploy(await OrderBook.deploy())
        {
            deployData.orderBook.implAddress = orderBook.address;
            deployData = (await saveDB(network, deployData))
            console.log('orderBook is deployed', orderBook.address)
        }
    }
    if (deployData.orderBook.address == undefined || deployData.orderBook.address == '') {
        var orderBook = await hre.ethers.getContractAt('OrderBook', deployData.orderBook.implAddress);
        var initializeData = orderBook.interface.encodeFunctionData('initialize', [deployData.marketRegistry.address]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.orderBook.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.orderBook.address = transparentUpgradeableProxy.address;
            deployData = (await saveDB(network, deployData))
            console.log('orderBook TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.orderBook.address, deployData.orderBook.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.orderBook.implAddress,
            [],
            {},
            "contracts/OrderBook.sol:OrderBook",
        )
    }
    {
        var orderBook = await hre.ethers.getContractAt('OrderBook', deployData.orderBook.implAddress);
        var initializeData = orderBook.interface.encodeFunctionData('initialize', [deployData.marketRegistry.address]);
        await verifyContract(
            deployData,
            network,
            deployData.orderBook.address,
            [
                deployData.orderBook.implAddress,
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