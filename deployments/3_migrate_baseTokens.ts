import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";

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
    let TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    let BaseToken = await hre.ethers.getContractFactory("BaseToken");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (network == 'local') {
        if (deployData.uniswapV3Factory.address == undefined || deployData.uniswapV3Factory.address == '') {
            const factoryFactory = await hre.ethers.getContractFactory("UniswapV3Factory")
            const uniV3Factory = await waitForDeploy(await factoryFactory.deploy())
            {
                deployData.uniswapV3Factory.address = uniV3Factory.address;
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('UniswapV3Factory is deployed', uniV3Factory.address)
            }
        }
    }
    if (deployData.baseToken.implAddress == undefined || deployData.baseToken.implAddress == '') {
        let baseToken = await waitForDeploy(await BaseToken.deploy());
        {
            deployData.baseToken.implAddress = baseToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('BaseToken is deployed', baseToken.address)
        }
    }
    for (let bTkn of deployData.baseTokens) {
        if (network == 'local') {
            if (bTkn.aggregatorAddress == undefined || bTkn.aggregatorAddress == '') {
                const aggregatorFactory = await hre.ethers.getContractFactory("TestAggregatorV3")
                const aggregator = await waitForDeploy(await aggregatorFactory.deploy())
                {
                    bTkn.aggregatorAddress = aggregator.address
                    await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                    console.log('TestAggregatorV3 is deployed', aggregator.address)
                }
            }
        }
        if (bTkn.priceFeedAddress == undefined || bTkn.priceFeedAddress == '') {
            const chainlinkPriceFeedFactory = await hre.ethers.getContractFactory("ChainlinkPriceFeedV2")
            const priceFeed = await waitForDeploy(await chainlinkPriceFeedFactory.deploy(bTkn.aggregatorAddress, 0))
            {
                bTkn.priceFeedAddress = priceFeed.address
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('ChainlinkPriceFeedV2 is deployed', priceFeed.address)
            }
        }
        if (bTkn.address == undefined || bTkn.address == '') {
            var baseToken = await hre.ethers.getContractAt('BaseToken', deployData.baseToken.implAddress);
            var initializeData = baseToken.interface.encodeFunctionData('initialize', [bTkn.name, bTkn.symbol, bTkn.priceFeedAddress]);
            var transparentUpgradeableProxy = await waitForDeploy(
                await TransparentUpgradeableProxy.deploy(
                    deployData.quoteToken.implAddress,
                    proxyAdmin.address,
                    initializeData,
                )
            );
            {
                deployData.quoteToken.address = transparentUpgradeableProxy.address;
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('BaseToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
            }
        }
    }
    // // 
    // if (deployData.quoteToken.address == undefined || deployData.quoteToken.address == '') {
    //     var quoteToken = await hre.ethers.getContractAt('BaseToken', deployData.quoteToken.implAddress);
    //     var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.quoteToken.name, deployData.quoteToken.symbol]);
    //     var transparentUpgradeableProxy = await waitForDeploy(
    //         await TransparentUpgradeableProxy.deploy(
    //             deployData.quoteToken.implAddress,
    //             proxyAdmin.address,
    //             initializeData,
    //         )
    //     );
    //     {
    //         deployData.quoteToken.address = transparentUpgradeableProxy.address;
    //         await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
    //         console.log('BaseToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
    //     }
    // }
    // {
    //     await upgradeContract(proxyAdmin as ProxyAdmin, deployData.quoteToken.address, deployData.quoteToken.implAddress)
    // }
    // // 
    // {
    //     await verifyContract(
    //         deployData,
    //         network,
    //         deployData.quoteToken.implAddress,
    //         [],
    //         {},
    //         "contracts/BaseToken.sol:BaseToken",
    //     )
    // }
    // {
    //     var quoteToken = await hre.ethers.getContractAt('BaseToken', deployData.quoteToken.implAddress);
    //     var initializeData = quoteToken.interface.encodeFunctionData('initialize', [deployData.quoteToken.name, deployData.quoteToken.symbol]);
    //     await verifyContract(
    //         deployData,
    //         network,
    //         deployData.quoteToken.address,
    //         [
    //             deployData.quoteToken.implAddress,
    //             proxyAdmin.address,
    //             initializeData,
    //         ],
    //         {},
    //         "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
    //     )
    // }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});