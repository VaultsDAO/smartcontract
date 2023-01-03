import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { ChainlinkPriceFeedV2 } from "../typechain/perp-oracle"
import { TestERC20 } from "../typechain";

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
    const TestERC20 = await hre.ethers.getContractFactory("TestERC20")
    // 
    if (network == 'local') {
        if (deployData.USDC.address == undefined || deployData.USDC.address == '') {
            const USDC = (await waitForDeploy(await TestERC20.deploy())) as TestERC20
            {
                deployData.USDC.address = USDC.address;
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('TestERC20 is deployed', USDC.address)
            }
            await USDC.__TestERC20_init(deployData.USDC.name, deployData.USDC.symbol, deployData.USDC.decimals)
        }
        if (deployData.wETH.address == undefined || deployData.wETH.address == '') {
            const wETH = (await waitForDeploy(await TestERC20.deploy())) as TestERC20
            {
                deployData.wETH.address = wETH.address;
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('TestERC20 is deployed', wETH.address)
            }
            await wETH.__TestERC20_init(deployData.wETH.name, deployData.wETH.symbol, deployData.wETH.decimals)
        }
        if (deployData.wBTC.address == undefined || deployData.wBTC.address == '') {
            const wBTC = (await waitForDeploy(await TestERC20.deploy())) as TestERC20
            {
                deployData.wBTC.address = wBTC.address;
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('TestERC20 is deployed', wBTC.address)
            }
            await wBTC.__TestERC20_init(deployData.wBTC.name, deployData.wBTC.symbol, deployData.wBTC.decimals)
        }
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});