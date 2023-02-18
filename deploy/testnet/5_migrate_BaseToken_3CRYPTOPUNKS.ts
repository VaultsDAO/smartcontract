import fs from "fs";

import hre from "hardhat";
import helpers from "../helpers";

import { ProxyAdmin } from "../../typechain/openzeppelin/ProxyAdmin";
import { BaseContract } from "ethers";
import { isAscendingTokenOrder } from "../../test/shared/utilities";
import { BaseToken } from "../../typechain";

const { waitForDeploy, waitForTx, verifyContract, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    const vETH = (await hre.ethers.getContractAt('QuoteToken', deployData.vETH.address)) as BaseToken;
    // 
    var baseToken = await hre.ethers.getContractAt('BaseToken', deployData.baseToken.implAddress);
    if (deployData.vCRYPTOPUNKS.address == undefined || deployData.vCRYPTOPUNKS.address == '') {
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vCRYPTOPUNKS.name, deployData.vCRYPTOPUNKS.symbol, deployData.nftPriceFeedCRYPTOPUNKS.address]);
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
            deployData.vCRYPTOPUNKS.address = transparentUpgradeableProxy.address;
            deployData = (await saveDB(network, deployData))
            console.log('vCRYPTOPUNKS TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.vCRYPTOPUNKS.address, deployData.baseToken.implAddress)
    }
    // upgrade NftPriceFeed
    {
        {
            const vCRYPTOPUNKS = (await hre.ethers.getContractAt('BaseToken', deployData.vCRYPTOPUNKS.address)) as BaseToken;
            if ((await vCRYPTOPUNKS.getPriceFeed()) != deployData.nftPriceFeedCRYPTOPUNKS.address) {
                waitForTx(await vCRYPTOPUNKS.setPriceFeed(deployData.nftPriceFeedCRYPTOPUNKS.address))
                console.log('vCRYPTOPUNKS setPriceFeed is deployed', vCRYPTOPUNKS.address)
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
        var initializeData = baseToken.interface.encodeFunctionData('initialize', [deployData.vCRYPTOPUNKS.name, deployData.vCRYPTOPUNKS.symbol, deployData.nftPriceFeedCRYPTOPUNKS.address]);
        await verifyContract(
            deployData,
            network,
            deployData.vCRYPTOPUNKS.address,
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