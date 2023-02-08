import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, ClearingHouseConfig, CollateralManager, Exchange, InsuranceFund, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, UniswapV3Pool, Vault } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;


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
    var uniswapV3Factory = await hre.ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
    var clearingHouseConfig = (await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address)) as ClearingHouseConfig;
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = (await hre.ethers.getContractAt('Exchange', deployData.exchange.address) as Exchange);
    var insuranceFund = (await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address)) as InsuranceFund;
    var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
    var collateralManager = (await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address)) as CollateralManager;
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

    var uniFeeTier = '3000' // 0.3%

    // deploy vault
    // await collateralManager.addCollateral(deployData.wETH.address, {
    //     priceFeed: deployData.priceFeedETH.address,
    //     collateralRatio: (0.8e6).toString(),
    //     discountRatio: (0.5e6).toString(),
    //     depositCap: parseUnits("1000", deployData.wETH.decimals),
    // })
    // await collateralManager.addCollateral(deployData.wBTC.address, {
    //     priceFeed: deployData.priceFeedBTC.address,
    //     collateralRatio: (0.8e6).toString(),
    //     discountRatio: (0.5e6).toString(),
    //     depositCap: parseUnits("1000", deployData.wBTC.decimals),
    // })

    const vETH = (await ethers.getContractAt('QuoteToken', deployData.vETH.address)) as QuoteToken;

    if ((await exchange.getAccountBalance()).toLowerCase() != accountBalance.address.toLowerCase()) {
        await waitForTx(await exchange.setAccountBalance(accountBalance.address), 'exchange.setAccountBalance(accountBalance.address)')
    }
    if ((await orderBook.getExchange()).toLowerCase() != exchange.address.toLowerCase()) {
        await waitForTx(await orderBook.setExchange(exchange.address), 'orderBook.setExchange(exchange.address)')
    }
    if ((await vault.getCollateralManager()).toLowerCase() != collateralManager.address.toLowerCase()) {
        await waitForTx(await vault.setCollateralManager(collateralManager.address), 'vault.setCollateralManager(collateralManager.address)')
    }
    if ((await insuranceFund.getVault()).toLowerCase() != vault.address.toLowerCase()) {
        await waitForTx(await insuranceFund.setVault(vault.address), 'insuranceFund.setVault(vault.address)')
    }
    if ((await accountBalance.getVault()).toLowerCase() != vault.address.toLowerCase()) {
        await waitForTx(await accountBalance.setVault(vault.address), 'accountBalance.setVault(vault.address)')
    }
    if ((await marketRegistry.getClearingHouse()).toLowerCase() != clearingHouse.address.toLowerCase()) {
        await waitForTx(await marketRegistry.setClearingHouse(clearingHouse.address), 'marketRegistry.setClearingHouse(clearingHouse.address)')
    }
    if ((await orderBook.getClearingHouse()).toLowerCase() != clearingHouse.address.toLowerCase()) {
        await waitForTx(await orderBook.setClearingHouse(clearingHouse.address), 'orderBook.setClearingHouse(clearingHouse.address)')
    }
    if ((await exchange.getClearingHouse()).toLowerCase() != clearingHouse.address.toLowerCase()) {
        await waitForTx(await exchange.setClearingHouse(clearingHouse.address), 'exchange.setClearingHouse(clearingHouse.address)')
    }
    if ((await accountBalance.getClearingHouse()).toLowerCase() != clearingHouse.address.toLowerCase()) {
        await waitForTx(await accountBalance.setClearingHouse(clearingHouse.address), 'accountBalance.setClearingHouse(clearingHouse.address)')
    }
    if ((await vault.getClearingHouse()).toLowerCase() != clearingHouse.address.toLowerCase()) {
        await waitForTx(await vault.setClearingHouse(clearingHouse.address), 'vault.setClearingHouse(clearingHouse.address)')
    }
    if (network == 'arbitrum' || network == 'arbitrumGoerli' || network == 'local') {
        if ((await vault.getWETH9()).toLowerCase() != clearingHouse.address.toLowerCase()) {
            await waitForTx(await vault.setWETH9(deployData.wETH.address), 'vault.setWETH9(deployData.wETH.address)')
        }
    }
    // deploy clearingHouse
    if (!(await vETH.isInWhitelist(clearingHouse.address))) {
        await waitForTx(await vETH.addWhitelist(clearingHouse.address), 'vETH.addWhitelist(clearingHouse.address)')
    }
    if (!(await vETH.totalSupply()).eq(ethers.constants.MaxUint256)) {
        await waitForTx(await vETH.mintMaximumTo(clearingHouse.address), 'vETH.mintMaximumTo(clearingHouse.address)')
    }
    if ((await clearingHouse.getPlatformFund()).toLowerCase() != deployData.platformFundAddress.toLowerCase()) {
        await waitForTx(
            await clearingHouse.setPlatformFund(deployData.platformFundAddress), 'clearingHouse.setPlatformFund(deployData.platformFundAddress)'
        )
    }
    if (!(await clearingHouseConfig.getSettlementTokenBalanceCap()).eq(ethers.constants.MaxUint256)) {
        await waitForTx(
            await clearingHouseConfig.setSettlementTokenBalanceCap(ethers.constants.MaxUint256), 'clearingHouseConfig.setSettlementTokenBalanceCap(ethers.constants.MaxUint256)'
        )
    }
    if ((await clearingHouseConfig.getImRatio()).toString() != '200000') {
        await waitForTx(
            await clearingHouseConfig.setImRatio('200000'), 'await clearingHouseConfig.setImRatio(200000)'
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });