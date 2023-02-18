import fs from "fs";

import hre, { ethers } from "hardhat";

import { parseEther } from "ethers/lib/utils";
import { ClearingHouse, Exchange, OrderBook, TestERC20, Vault } from "../../typechain";

import helpers from "../helpers";
import { priceToTick } from "../../test/helper/number";
const { waitForTx, loadDB } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 

    const [admin, maker, priceAdmin] = await ethers.getSigners()

    // deploy UniV3 factory
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

    let baseTokens = [
        deployData.vBAYC,
        deployData.vMAYC,
        deployData.vCRYPTOPUNKS,
        deployData.vMOONBIRD,
        deployData.vAZUKI,
        deployData.vCLONEX,
        deployData.vDOODLE,
    ];
    let priceKeys = [
        'priceBAYC',
        'priceMAYC',
        'priceCRYPTOPUNKS',
        'priceMOONBIRD',
        'priceAZUKI',
        'priceCLONEX',
        'priceDOODLE'
    ];

    let initLiquidities = [
        parseEther('460.55'),
        parseEther('510.39'),
        parseEther('254.84'),
        parseEther('793.12'),
        parseEther('522.05'),
        parseEther('928.31'),
        parseEther('892.10'),
    ];

    for (let i = 0; i < baseTokens.length; i++) {
        console.log(
            '--------------------------------------',
            priceKeys[i].substring(5),
            '--------------------------------------',
        )

        var baseTokenAddress = baseTokens[i].address
        var initLiquidity = initLiquidities[i]

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
        } else if (initLiquidity.lt(liquidity)) {
            await waitForTx(
                await clearingHouse.connect(maker).removeLiquidity({
                    baseToken: baseToken.address,
                    liquidity: liquidity.sub(initLiquidity),
                    deadline: ethers.constants.MaxUint256,
                }),
                'clearingHouse.connect(maker).removeLiquidity'
            )
        }
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});