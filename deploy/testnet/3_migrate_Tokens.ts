import fs from "fs";

import hre from "hardhat";
import helpers from "../helpers";

import { TestERC20, TestWETH9 } from "../../typechain";

const {  waitForDeploy, verifyContract, loadDB, saveDB } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 
    if (network != 'arbitrum' && network != 'arbitrumGoerli') {
        const TestERC20 = await hre.ethers.getContractFactory("TestERC20")

        if (deployData.wETH.address == undefined || deployData.wETH.address == '') {
            if (network == 'local') {
                const TestWETH9 = await hre.ethers.getContractFactory("TestWETH9")
                const wETH = (await waitForDeploy(await TestWETH9.deploy())) as TestWETH9
                {
                    deployData.wETH.address = wETH.address;
                    deployData = (await saveDB(network, deployData))
                    console.log('TestWETH9 is deployed', wETH.address)
                }
            } else {
                const wETH = (await waitForDeploy(await TestERC20.deploy())) as TestERC20
                {
                    deployData.wETH.address = wETH.address;
                    deployData = (await saveDB(network, deployData))
                    console.log('wETH is deployed', wETH.address)
                }
                await wETH.__TestERC20_init(deployData.wETH.name, deployData.wETH.symbol, deployData.wETH.decimals)
            }
        }
        {
            await verifyContract(
                deployData,
                network,
                deployData.wETH.address,
                [],
                {},
                "contracts/test/TestERC20.sol:TestERC20",
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