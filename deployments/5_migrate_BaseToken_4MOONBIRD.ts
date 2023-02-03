import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { BaseContract } from "ethers";
import { isAscendingTokenOrder } from "../test/shared/utilities";
import { BaseToken } from "../typechain";

const { waitForDeploy, waitForTx, verifyContract, upgradeContract } = helpers;

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
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    const vETH = (await hre.ethers.getContractAt('QuoteToken', deployData.vETH.address)) as BaseToken;
    // 
    var baseToken = await hre.ethers.getContractAt('BaseToken', deployData.baseToken.implAddress);
    if (deployData.vMOONBIRD.address == undefined || deployData.vMOONBIRD.address == '') {
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vMOONBIRD.name, deployData.vMOONBIRD.symbol, deployData.nftPriceFeedMOONBIRD.address]);
        var transparentUpgradeableProxy: BaseContract
        do {
            transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    baseToken.address,
                    proxyAdmin.address,
                    initializeData,
                )
            ) as BaseContract;
        } while (!isAscendingTokenOrder(transparentUpgradeableProxy.address.toString(), vETH.address))
        {
            deployData.vMOONBIRD.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('vMOONBIRD TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.vMOONBIRD.address, deployData.baseToken.implAddress)
    }
    // upgrade NftPriceFeed
    {
        {
            const vMOONBIRD = (await hre.ethers.getContractAt('BaseToken', deployData.vMOONBIRD.address)) as BaseToken;
            if ((await vMOONBIRD.getPriceFeed()) != deployData.nftPriceFeedMOONBIRD.address) {
                waitForTx(await vMOONBIRD.setPriceFeed(deployData.nftPriceFeedMOONBIRD.address))
                console.log('vMOONBIRD setPriceFeed is deployed', vMOONBIRD.address)
            }
        }
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.baseToken.implAddress,
            [],
            {},
            "contracts/BaseToken.sol:BaseToken",
        )
    }
    {
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vMOONBIRD.name, deployData.vMOONBIRD.symbol, deployData.nftPriceFeedMOONBIRD.address]);
        await verifyContract(
            deployData,
            network,
            deployData.vMOONBIRD.address,
            [
                baseToken.address,
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