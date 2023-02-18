import fs from "fs";

import hre from "hardhat";
import helpers from "../helpers";

import { ProxyAdmin } from "../../typechain/openzeppelin/ProxyAdmin";
import { parseUnits } from "ethers/lib/utils";

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
    const CollateralManager = await hre.ethers.getContractFactory("CollateralManager");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.collateralManager.implAddress == undefined || deployData.collateralManager.implAddress == '') {
        const collateralManager = await waitForDeploy(await CollateralManager.deploy())
        {
            deployData.collateralManager.implAddress = collateralManager.address;
            deployData = (await saveDB(network, deployData))
            console.log('collateralManager is deployed', collateralManager.address)
        }
    }
    if (deployData.collateralManager.address == undefined || deployData.collateralManager.address == '') {
        var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.implAddress);
        var initializeData = collateralManager.interface.encodeFunctionData('initialize', [
            deployData.clearingHouseConfig.address,
            deployData.vault.address,
            3, // maxCollateralTokensPerAccount
            "750000", // debtNonSettlementTokenValueRatio
            "500000", // liquidationRatio
            "5000", // mmRatioBuffer
            "12500", // clInsuranceFundFeeRatio
            parseUnits("10", deployData.wETH.decimals), // debtThreshold
            parseUnits("0.3", deployData.wETH.decimals), // collateralValueDust
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.collateralManager.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.collateralManager.address = transparentUpgradeableProxy.address;
            deployData = (await saveDB(network, deployData))
            console.log('collateralManager TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.collateralManager.address, deployData.collateralManager.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.collateralManager.implAddress,
            [],
            {},
            "contracts/CollateralManager.sol:CollateralManager",
        )
    }
    {
        var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.implAddress);
        var initializeData = collateralManager.interface.encodeFunctionData('initialize', [
            deployData.clearingHouseConfig.address,
            deployData.vault.address,
            3, // maxCollateralTokensPerAccount
            "750000", // debtNonSettlementTokenValueRatio
            "500000", // liquidationRatio
            "5000", // mmRatioBuffer
            "12500", // clInsuranceFundFeeRatio
            parseUnits("10", deployData.wETH.decimals), // debtThreshold
            parseUnits("0.3", deployData.wETH.decimals), // collateralValueDust
        ]);
        await verifyContract(
            deployData,
            network,
            deployData.collateralManager.address,
            [
                deployData.collateralManager.implAddress,
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