import fs from "fs";

import hre, { ethers } from "hardhat";

import { parseEther } from "ethers/lib/utils";
import { ClearingHouse, Exchange, OrderBook, TestERC20, Vault } from "../../typechain";

import helpers from "../helpers";
import { priceToTick } from "../../test/helper/number";
const { waitForTx } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 

    const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()

    // deploy UniV3 factory
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

    var baseTokenAddress = deployData.vBAYC.address
    let initLiquidity = parseEther('10000')

    const baseToken = await hre.ethers.getContractAt('BaseToken', baseTokenAddress);
    let liquidity = await orderBook.getLiquidity(baseToken.address)
    if (initLiquidity.gt(liquidity)) {
        await waitForTx(
            await clearingHouse.connect(maker).addLiquidity({
                baseToken: baseToken.address,
                liquidity: initLiquidity.sub(liquidity),
                deadline: ethers.constants.MaxUint256,
            }),
            'clearingHouse.connect(maker).addLiquidity'
        )
        deployData = (await saveDB(network, deployData))
    }
    if (initLiquidity.lt(liquidity)) {
        await waitForTx(
            await clearingHouse.connect(maker).removeLiquidity({
                baseToken: baseToken.address,
                liquidity: liquidity.sub(initLiquidity),
                deadline: ethers.constants.MaxUint256,
            }),
            'clearingHouse.connect(maker).removeLiquidity'
        )
        deployData = (await saveDB(network, deployData))
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });