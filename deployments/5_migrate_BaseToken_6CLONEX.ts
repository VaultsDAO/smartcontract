import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { BaseContract } from "ethers";
import { isAscendingTokenOrder } from "../test/shared/utilities";
import { BaseToken } from "../typechain";

const { waitForDeploy, waitForTx, verifyContract, upgradeContract } = helpers;

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
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    const vETH = (await hre.ethers.getContractAt('QuoteToken', deployData.vETH.address)) as BaseToken;
    // 
    var baseToken = await hre.ethers.getContractAt('BaseToken', deployData.baseToken.implAddress);
    if (deployData.vCLONEX.address == undefined || deployData.vCLONEX.address == '') {
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vCLONEX.name, deployData.vCLONEX.symbol, deployData.nftPriceFeedCLONEX.address]);
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
            deployData.vCLONEX.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('vCLONEX TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.vCLONEX.address, deployData.baseToken.implAddress)
    }
    // upgrade NftPriceFeed
    {
        {
            const vCLONEX = (await hre.ethers.getContractAt('BaseToken', deployData.vCLONEX.address)) as BaseToken;
            if ((await vCLONEX.getPriceFeed()) != deployData.nftPriceFeedCLONEX.address) {
                waitForTx(await vCLONEX.setPriceFeed(deployData.nftPriceFeedCLONEX.address))
                console.log('vCLONEX setPriceFeed is deployed', vCLONEX.address)
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
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vCLONEX.name, deployData.vCLONEX.symbol, deployData.nftPriceFeedCLONEX.address]);
        await verifyContract(
            deployData,
            network,
            deployData.vCLONEX.address,
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});