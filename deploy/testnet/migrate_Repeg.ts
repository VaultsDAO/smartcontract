import fs from "fs";

import bn from "bignumber.js"

import hre, { ethers } from "hardhat";

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, ClearingHouseConfig, CollateralManager, Exchange, InsuranceFund, MarketRegistry, MockPNFTToken, NftPriceFeed, OrderBook, QuoteToken, RewardMiner, TestFaucet, UniswapV3Pool, Vault } from "../../typechain";
import { getMaxTickRange } from "../../test/helper/number";
import helpers from "../helpers";
import { formatEther, parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx, loadDB } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {

    const network = hre.network.name;
    let deployData = (await loadDB(network))

    const [admin, maker, priceAdmin, platformFund, trader1, trader2, trader3, trader4, hieuq] = await ethers.getSigners()

    // deploy UniV3 factory
    var clearingHouseConfig = (await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address)) as ClearingHouseConfig;
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = (await hre.ethers.getContractAt('Exchange', deployData.exchange.address) as Exchange);
    var insuranceFund = (await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address)) as InsuranceFund;
    var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
    var collateralManager = (await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address)) as CollateralManager;
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;
    var rewardMiner = (await hre.ethers.getContractAt('RewardMiner', deployData.rewardMiner.address)) as RewardMiner;
    var pNFTToken = (await hre.ethers.getContractAt('MockPNFTToken', deployData.pNFTToken.address)) as MockPNFTToken;
    var testFaucet = (await hre.ethers.getContractAt('TestFaucet', deployData.testFaucet.address)) as TestFaucet;

    let baseTokens = [
        deployData.vBAYC,
        deployData.vMAYC,
        deployData.vCRYPTOPUNKS,
        deployData.vMOONBIRD,
        deployData.vAZUKI,
        deployData.vCLONEX,
        deployData.vDOODLE,
    ];
    for (let i = 0; i < baseTokens.length; i++) {
        let baseTokenAddr = baseTokens[i].address
        var isAbleRepeg = (await clearingHouse.isAbleRepeg(baseTokenAddr))
        console.log(
            baseTokenAddr,
            'isAbleRepeg',
            isAbleRepeg
        )
        if (isAbleRepeg) {
            await waitForTx(
                await clearingHouse.connect(platformFund).repeg(baseTokenAddr),
                'clearingHouse.repeg(' + baseTokenAddr + ')'
            )
        } else {
            let isOverPriceSpread = await exchange.isOverPriceSpread(baseTokenAddr)
            console.log(
                baseTokenAddr,
                'isOverPriceSpread',
                isOverPriceSpread
            )
            let overPriceSpreadTimestamp = await exchange.getOverPriceSpreadTimestamp(baseTokenAddr)
            console.log(
                baseTokenAddr,
                'overPriceSpreadTimestamp',
                overPriceSpreadTimestamp.toString()
            )
            var isUpdateOverPriceSpreadTimestamp = false
            if (isOverPriceSpread) {
                if (overPriceSpreadTimestamp.eq(0)) {
                    isUpdateOverPriceSpreadTimestamp = true
                }
            } else {
                if (!overPriceSpreadTimestamp.eq(0)) {
                    isUpdateOverPriceSpreadTimestamp = true
                }
            }
            if (isUpdateOverPriceSpreadTimestamp) {
                await waitForTx(
                    await exchange.connect(platformFund).updateOverPriceSpreadTimestamp(baseTokenAddr),
                    'exchange.updateOverPriceSpreadTimestamp(' + baseTokenAddr + ')'
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