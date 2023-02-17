import fs from "fs";

import hre, { ethers } from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../../typechain/openzeppelin/ProxyAdmin";

const { waitForDeploy, verifyContract, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deploy/testnet/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())

    // 
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    const GenericLogic = await hre.ethers.getContractFactory("GenericLogic");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    if (network == 'local') {
        const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()
        deployData.platformFundAddress = platformFund.address
        deployData.makerFundAddress = maker.address
    }
    //
    if (deployData.clearingHouse.implAddress == undefined || deployData.clearingHouse.implAddress == '') {
        var genericLogic = await hre.ethers.getContractAt('GenericLogic', deployData.genericLogic.address);
        var liquidityLogic = await hre.ethers.getContractAt('LiquidityLogic', deployData.liquidityLogic.address);
        var exchangeLogic = await hre.ethers.getContractAt('ExchangeLogic', deployData.exchangeLogic.address);
        let ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse", {
            libraries: {
                GenericLogic: genericLogic.address,
                LiquidityLogic: liquidityLogic.address,
                ExchangeLogic: exchangeLogic.address,
            },
        });
        const clearingHouse = await waitForDeploy(await ClearingHouse.deploy())
        {
            deployData.clearingHouse.implAddress = clearingHouse.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('clearingHouse is deployed', clearingHouse.address)
        }
    }
    if (deployData.clearingHouse.address == undefined || deployData.clearingHouse.address == '') {
        var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.implAddress);
        var initializeData = clearingHouse.interface.encodeFunctionData('initialize', [
            deployData.clearingHouseConfig.address,
            deployData.vault.address,
            deployData.vETH.address,
            deployData.uniswapV3Factory.address,
            deployData.exchange.address,
            deployData.accountBalance.address,
            deployData.marketRegistry.address,
            deployData.insuranceFund.address,
            deployData.platformFundAddress,
            deployData.makerFundAddress,
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.clearingHouse.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.clearingHouse.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('clearingHouse TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.clearingHouse.address, deployData.clearingHouse.implAddress)
    }
    {
        var genericLogic = await hre.ethers.getContractAt('GenericLogic', deployData.genericLogic.address);
        var liquidityLogic = await hre.ethers.getContractAt('LiquidityLogic', deployData.liquidityLogic.address);
        var exchangeLogic = await hre.ethers.getContractAt('ExchangeLogic', deployData.liquidityLogic.address);
        await verifyContract(
            deployData,
            network,
            deployData.clearingHouse.implAddress,
            [],
            {
                GenericLogic: genericLogic.address,
                LiquidityLogic: liquidityLogic.address,
                ExchangeLogic: exchangeLogic.address,
            },
            "contracts/ClearingHouse.sol:ClearingHouse",
        )
    }
    {
        var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.implAddress);
        var initializeData = clearingHouse.interface.encodeFunctionData('initialize', [
            deployData.clearingHouseConfig.address,
            deployData.vault.address,
            deployData.vETH.address,
            deployData.uniswapV3Factory.address,
            deployData.exchange.address,
            deployData.accountBalance.address,
            deployData.marketRegistry.address,
            deployData.insuranceFund.address,
            deployData.platformFundAddress,
            deployData.makerFundAddress,
        ]);
        await verifyContract(
            deployData,
            network,
            deployData.clearingHouse.address,
            [
                deployData.clearingHouse.implAddress,
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