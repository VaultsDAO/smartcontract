import fs from "fs";

import hre, { ethers } from "hardhat";

import { parseEther } from "ethers/lib/utils";
import { ClearingHouse, OrderBook, TestERC20, Vault } from "../typechain";

import helpers from "./helpers";
import { priceToTick } from "../test/helper/number";
const { waitForTx } = helpers;


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

    const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()

    // deploy UniV3 factory
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

    var baseTokenAddress = deployData.vBAYC.address

    const lowerTick: number = priceToTick(7.0, 60)
    const upperTick: number = priceToTick(700.0, 60)

    const baseToken = await hre.ethers.getContractAt('BaseToken', baseTokenAddress);
    {
        await waitForTx(
            await clearingHouse.connect(maker).addLiquidity({
                baseToken: baseToken.address,
                lowerTick,
                upperTick,
                liquidity: '2000',
                deadline: ethers.constants.MaxUint256,
            }),
            'clearingHouse.connect(maker).addLiquidity'
        )
        deployData.testCheck.addLiquidity = true
        await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});