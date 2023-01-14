import fs from "fs";

import hre, { ethers } from "hardhat";

import { parseEther } from "ethers/lib/utils";
import { ClearingHouse, OrderBook, TestERC20, Vault } from "../typechain";

import helpers from "./helpers";
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

    if (network == 'local') {
        const [admin, maker, trader, liquidator, priceAdmin, platformFund] = await ethers.getSigners()


        // deploy UniV3 factory
        var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
        var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
        var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

        var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

        const vBAYC = await hre.ethers.getContractAt('BaseToken', deployData.vBAYC.address);

        {
            var priceFeed = await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address);
            await waitForTx (
                await priceFeed.setPrice(parseEther('100'))
            )
        }
        {
            var priceFeed = await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address);
            await waitForTx (
                await priceFeed.setPrice(parseEther('100'))
            )
        }

        const lowerTick: number = 45780
        const upperTick: number = 46440

        if (!deployData.testCheck.addLiquidity) {
            await waitForTx(
                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: vBAYC.address,
                    base: parseEther("100"),
                    quote: parseEther("10000"),
                    lowerTick,
                    upperTick,
                    minBase: 0,
                    minQuote: 0,
                    useTakerBalance: false,
                    deadline: ethers.constants.MaxUint256,
                })
            )
            deployData.testCheck.addLiquidity = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }
        if (!deployData.testCheck.deposit) {
            await waitForTx(
                await wETH.mint(trader.address, parseEther('1000'))
            )
            await waitForTx(
                await wETH.connect(trader).approve(vault.address, ethers.constants.MaxUint256)
            )
            await waitForTx(
                await vault.connect(trader).deposit(wETH.address, parseEther('1000'))
            )
            deployData.testCheck.deposit = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }
        if (!deployData.testCheck.openPosition) {
            await waitForTx(
                await clearingHouse.connect(trader).openPosition({
                    baseToken: vBAYC.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther("0.5"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })
            )
            deployData.testCheck.openPosition = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }

        if (!deployData.testCheck.closePosition) {
            await waitForTx(
                await clearingHouse.connect(trader).openPosition({
                    baseToken: vBAYC.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther("0.5"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })
            )
            deployData.testCheck.closePosition = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }

        if (!deployData.testCheck.removeLiquidity) {
            await waitForTx(
                await clearingHouse.connect(maker).removeLiquidity({
                    baseToken: vBAYC.address,
                    lowerTick,
                    upperTick,
                    liquidity: (
                        await orderBook.getOpenOrder(admin.address, wETH.address, lowerTick, upperTick)
                    ).liquidity,
                    minBase: parseEther("0"),
                    minQuote: parseEther("0"),
                    deadline: ethers.constants.MaxUint256,
                })
            )
            deployData.testCheck.removeLiquidity = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});