import fs from "fs";

import hre, { ethers } from "hardhat";

import { parseEther } from "ethers/lib/utils";
import { ClearingHouse, OrderBook, TestERC20, TestWETH9, Vault } from "../../typechain";

import helpers from "../helpers";
const { waitForTx } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 

    if (network == 'local') {
        const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()


        // deploy UniV3 factory
        var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
        var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
        var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

        if (!deployData.testCheck.deposit) {
            // var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;
            // await waitForTx(
            //     await wETH.mint(trader.address, parseEther('1000')),
            //     'wETH.mint(trader.address, parseEther(1000))'
            // )
            // await waitForTx(
            //     await wETH.connect(trader).approve(vault.address, ethers.constants.MaxUint256),
            //     'wETH.connect(trader).approve(vault.address, ethers.constants.MaxUint256)'
            // )
            // await waitForTx(
            //     await vault.connect(trader).deposit(wETH.address, parseEther('1000')),
            //     'vault.connect(trader).deposit(wETH.address, parseEther(1000))'
            // )
            
            console.log(
                await vault.getWETH9()
            )

            await waitForTx(
                await vault.connect(trader).depositEther({ value: parseEther('10') }),
                'vault.connect(trader).depositEther({ value: parseEther(10))'
            )
            deployData.testCheck.deposit = true
            deployData = (await saveDB(network, deployData))
        }

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
            var baseTokenAddress = baseTokens[i].address
            var nftPriceFeedAddress = nftPriceFeeds[i].address

            // {
            //     var priceFeed = await hre.ethers.getContractAt('NftPriceFeed', nftPriceFeedAddress);
            //     await priceFeed.connect(priceAdmin).setPrice(parseEther('1')), 'priceFeed.connect(priceAdmin).setPrice(parseEther(1))'
            // }

            var baseToken = await hre.ethers.getContractAt('BaseToken', baseTokenAddress);

            {
                await waitForTx(
                    await clearingHouse.connect(maker).addLiquidity({
                        baseToken: baseToken.address,
                        liquidity: parseEther('1000'),
                        deadline: ethers.constants.MaxUint256,
                    }),
                    'clearingHouse.connect(maker).addLiquidity'
                )
            }
            {
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
            }
            {
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
            }
            {
                await waitForTx(
                    await clearingHouse.connect(maker).removeLiquidity({
                        baseToken: baseToken.address,
                        liquidity: parseEther('1000'),
                        deadline: ethers.constants.MaxUint256,
                    }),
                    'clearingHouse.connect(maker).removeLiquidity'
                )
            }
        }
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});