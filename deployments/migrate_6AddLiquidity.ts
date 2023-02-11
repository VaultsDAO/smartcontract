import fs from "fs";

import hre, { ethers } from "hardhat";

import { parseEther } from "ethers/lib/utils";
import { ClearingHouse, Exchange, OrderBook, TestERC20, Vault } from "../typechain";

import helpers from "./helpers";
import { priceToTick } from "../test/helper/number";
const { waitForTx } = helpers;


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

    const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()

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
    // 50 ETH -> 1%
    let initLiquidities = [
        parseEther('1183').mul(2),// 100E for 1%
        parseEther('2558'),
        parseEther('1246'),
        parseEther('3618'),
        parseEther('2539'),
        parseEther('4388'),
        parseEther('3986'),
    ];

    if (network == 'arbitrumGoerli') {
        initLiquidities = [
            parseEther('1183').div(1),// 50E for 1%
            parseEther('2558').div(2),// 25E for 1%
            parseEther('1246').div(2),// 25E for 1%
            parseEther('3618').div(2),// 25E for 1%
            parseEther('2539').div(2),// 25E for 1%
            parseEther('4388').div(2),// 25E for 1%
            parseEther('3986').div(2),// 25E for 1%
        ];
    }

    for (let i = 0; i < baseTokens.length; i++) {
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