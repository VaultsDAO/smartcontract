import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { parseUnits } from "ethers/lib/utils";

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
    const CollateralManager = await hre.ethers.getContractFactory("CollateralManager");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.collateralManager.implAddress == undefined || deployData.collateralManager.implAddress == '') {
        const collateralManager = await waitForDeploy(await CollateralManager.deploy())
        {
            deployData.collateralManager.implAddress = collateralManager.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('CollateralManager is deployed', collateralManager.address)
        }
    }
    if (deployData.collateralManager.address == undefined || deployData.collateralManager.address == '') {
        var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.implAddress);
        var initializeData = collateralManager.interface.encodeFunctionData('initialize', [
            deployData.clearingHouseConfig.address,
            deployData.vault.address,
            5, // maxCollateralTokensPerAccount
            "750000", // debtNonSettlementTokenValueRatio
            "500000", // liquidationRatio
            "2000", // mmRatioBuffer
            "30000", // clInsuranceFundFeeRatio
            parseUnits("10000", deployData.USDC.decimals), // debtThreshold
            parseUnits("500", deployData.USDC.decimals), // collateralValueDust
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
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('CollateralManager TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
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
            5, // maxCollateralTokensPerAccount
            "750000", // debtNonSettlementTokenValueRatio
            "500000", // liquidationRatio
            "2000", // mmRatioBuffer
            "30000", // clInsuranceFundFeeRatio
            parseUnits("10000", deployData.USDC.decimals), // debtThreshold
            parseUnits("500", deployData.USDC.decimals), // collateralValueDust
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});