import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { ChainlinkPriceFeedV2 } from "../typechain/perp-oracle"

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
    const OrderBook = await hre.ethers.getContractFactory("OrderBook");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.orderBook.implAddress == undefined || deployData.orderBook.implAddress == '') {
        const orderBook = await waitForDeploy(await OrderBook.deploy())
        {
            deployData.orderBook.implAddress = orderBook.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('OrderBook is deployed', orderBook.address)
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
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('OrderBook TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});