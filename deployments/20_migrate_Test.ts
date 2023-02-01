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
        const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()


        // deploy UniV3 factory
        var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
        var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
        var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

        var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

        const vBAYC = await hre.ethers.getContractAt('BaseToken', deployData.vBAYC.address);
        const vMAYC = await hre.ethers.getContractAt('BaseToken', deployData.vMAYC.address);

        {
            var priceFeed = await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address);
            await waitForTx(
                await priceFeed.connect(priceAdmin).setPrice(parseEther('100')), 'priceFeed.connect(priceAdmin).setPrice(parseEther(100))'
            )
        }
        {
            var priceFeed = await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address);
            await waitForTx(
                await priceFeed.connect(priceAdmin).setPrice(parseEther('100')), 'priceFeed.connect(priceAdmin).setPrice(parseEther(100))'
            )
        }

        var baseToken = vBAYC

        if (!deployData.testCheck.addLiquidity) {
            await waitForTx(
                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: baseToken.address,
                    liquidity: parseEther('1000'),
                    deadline: ethers.constants.MaxUint256,
                }),
                'clearingHouse.connect(maker).addLiquidity'
            )
            deployData.testCheck.addLiquidity = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }
        if (!deployData.testCheck.deposit) {
            await waitForTx(
                await wETH.mint(trader.address, parseEther('1000')),
                'wETH.mint(trader.address, parseEther(1000))'
            )
            await waitForTx(
                await wETH.connect(trader).approve(vault.address, ethers.constants.MaxUint256),
                'wETH.connect(trader).approve(vault.address, ethers.constants.MaxUint256)'
            )
            await waitForTx(
                await vault.connect(trader).deposit(wETH.address, parseEther('1000')),
                'vault.connect(trader).deposit(wETH.address, parseEther(1000))'
            )
            deployData.testCheck.deposit = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }
        if (!deployData.testCheck.openPosition) {
            await waitForTx(
                await clearingHouse.connect(trader).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther("0.5"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                }),
                'clearingHouse.connect(trader).openPosition'
            )
            deployData.testCheck.openPosition = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }

        if (!deployData.testCheck.closePosition) {
            await waitForTx(
                await clearingHouse.connect(trader).closePosition({
                    baseToken: baseToken.address,
                    sqrtPriceLimitX96: parseEther("0"),
                    oppositeAmountBound: parseEther("0"),
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                }),
                'clearingHouse.connect(trader).closePosition'
            )
            deployData.testCheck.closePosition = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }

        if (!deployData.testCheck.removeLiquidity) {
            await waitForTx(
                await clearingHouse.connect(maker).removeLiquidity({
                    baseToken: baseToken.address,
                    liquidity: (
                        await orderBook.getOpenOrder(wETH.address)
                    ).liquidity,
                    deadline: ethers.constants.MaxUint256,
                }),
                'clearingHouse.connect(maker).removeLiquidity'
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