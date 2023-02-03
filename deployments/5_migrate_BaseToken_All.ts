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
    const BaseToken = await hre.ethers.getContractFactory("BaseToken");
    // 
    if (deployData.baseToken.implAddress == undefined || deployData.baseToken.implAddress == '') {
        let baseToken = await waitForDeploy(await BaseToken.deploy());
        {
            deployData.baseToken.implAddress = baseToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('baseToken is deployed', baseToken.address)
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
    var baseToken = await hre.ethers.getContractAt('BaseToken', deployData.baseToken.implAddress);
    let baseTokens = [
        deployData.vBAYC,
        deployData.vMAYC,
        deployData.vCRYPTOPUNKS,
        deployData.vMOONBIRD,
        deployData.vAZUKI,
        deployData.vCLONEX,
        deployData.vDOODLE,
    ];
    let nftPriceFeeds = [
        deployData.nftPriceFeedBAYC,
        deployData.nftPriceFeedMAYC,
        deployData.nftPriceFeedCRYPTOPUNKS,
        deployData.nftPriceFeedMOONBIRD,
        deployData.nftPriceFeedAZUKI,
        deployData.nftPriceFeedCLONEX,
        deployData.nftPriceFeedDOODLE,
    ];
    for (let i = 0; i < baseTokens.length; i++) {
        var baseVToken = baseTokens[i]
        var nftPriceFeed = nftPriceFeeds[i]
        if (baseVToken.address == undefined || baseVToken.address == '') {
            var initializeData = baseToken.interface.encodeFunctionData('initialize', [baseVToken.name, baseVToken.symbol, nftPriceFeed.address]);
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
                baseVToken.address = transparentUpgradeableProxy.address;
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('vBaseToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
            }
        }
        {
            await upgradeContract(proxyAdmin as ProxyAdmin, baseVToken.address, deployData.baseToken.implAddress)
        }
        // upgrade NftPriceFeed
        {
            {
                const vBaseToken = (await hre.ethers.getContractAt('BaseToken', baseVToken.address)) as BaseToken;
                if ((await vBaseToken.getPriceFeed()) != nftPriceFeed.address) {
                    waitForTx(await vBaseToken.setPriceFeed(nftPriceFeed.address))
                    console.log('vBaseToken setPriceFeed is deployed', vBaseToken.address)
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
            var initializeData = baseToken.interface.encodeFunctionData('initialize', [baseVToken.name, baseVToken.symbol, nftPriceFeed.address]);
            await verifyContract(
                deployData,
                network,
                baseVToken.address,
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
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });