import fs from "fs";

import hre, { ethers } from "hardhat";

import { UniswapV3Pool } from "../typechain/UniswapV3Pool";
import { parseUnits } from "ethers/lib/utils";
import { encodePriceSqrt } from "../test/shared/utilities";
import { AccountBalance, MarketRegistry, OrderBook } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";


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
    const QuoteToken = await hre.ethers.getContractFactory("QuoteToken");
    const BaseToken = await hre.ethers.getContractFactory("BaseToken");

    // deploy UniV3 factory
    var uniswapV3Factory = await hre.ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
    var clearingHouseConfig = await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address);
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = await hre.ethers.getContractAt('Exchange', deployData.exchange.address);
    var insuranceFund = await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address);
    var vault = await hre.ethers.getContractAt('Vault', deployData.vault.address);
    var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address);
    var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);

    var uniFeeTier = 3000 // 0.3%

    await exchange.setAccountBalance(accountBalance.address)
    await orderBook.setExchange(exchange.address)
    await vault.setCollateralManager(collateralManager.address)
    await insuranceFund.setVault(vault.address)
    await accountBalance.setVault(vault.address)
    await clearingHouseConfig.setSettlementTokenBalanceCap(ethers.constants.MaxUint256)
    await marketRegistry.setClearingHouse(clearingHouse.address)
    await orderBook.setClearingHouse(clearingHouse.address)
    await exchange.setClearingHouse(clearingHouse.address)
    await accountBalance.setClearingHouse(clearingHouse.address)
    await vault.setClearingHouse(clearingHouse.address)
    if (network == 'arbitrum') {
        await vault.setWETH9(deployData.wETH.address)
    }

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

    var vUSD = await QuoteToken.attach(deployData.vUSD.address)

    const vBAYC = await ethers.getContractAt('BaseToken', deployData.vBAYC.address);
    {
        await uniswapV3Factory.createPool(deployData.vBAYC.address, deployData.vUSD.address, uniFeeTier)
        const poolBAYCAddr = uniswapV3Factory.getPool(vBAYC.address, vUSD.address, uniFeeTier)
        const poolBAYC = await ethers.getContractAt('UniswapV3Pool', poolBAYCAddr);
        await vBAYC.addWhitelist(poolBAYC.address)
        await vUSD.addWhitelist(poolBAYC.address)
    }

    const vMAYC = await ethers.getContractAt('BaseToken', deployData.vMAYC.address);
    {
        await uniswapV3Factory.createPool(deployData.vMAYC.address, deployData.vUSD.address, uniFeeTier)
        const poolMAYCAddr = await uniswapV3Factory.getPool(vMAYC.address, vUSD.address, uniFeeTier)
        const poolMAYC = await ethers.getContractAt('UniswapV3Pool', poolMAYCAddr);
        await vMAYC.addWhitelist(poolMAYC.address)
        await vUSD.addWhitelist(poolMAYC.address)
    }

    // deploy clearingHouse
    await vUSD.addWhitelist(clearingHouse.address)
    await vBAYC.addWhitelist(clearingHouse.address)
    await vMAYC.addWhitelist(clearingHouse.address)

    await vUSD.mintMaximumTo(clearingHouse.address)
    await vBAYC.mintMaximumTo(clearingHouse.address)
    await vMAYC.mintMaximumTo(clearingHouse.address)

    // initMarket
    var maxTickCrossedWithinBlock: number = getMaxTickRange()
    // vBAYC
    {
        const poolAddr = await uniswapV3Factory.getPool(vBAYC.address, vUSD.address, uniFeeTier)
        const uniPool = await ethers.getContractAt('UniswapV3Pool', poolAddr);
        if (network == 'local') {
            await uniPool.initialize(encodePriceSqrt('100', "1"))
        } else {
            await uniPool.initialize(encodePriceSqrt('80', "1"))
        }
        const uniFeeRatio = await uniPool.fee()
        await uniPool.increaseObservationCardinalityNext(500)
        await marketRegistry.addPool(vBAYC.address, uniFeeRatio)
        await exchange.setMaxTickCrossedWithinBlock(vBAYC.address, maxTickCrossedWithinBlock)
    }
    // vMAYC
    {
        const poolAddr = await uniswapV3Factory.getPool(vMAYC.address, vUSD.address, uniFeeTier)
        const uniPool = await ethers.getContractAt('UniswapV3Pool', poolAddr);
        if (network == 'local') {
            await uniPool.initialize(encodePriceSqrt('100', "1"))
        } else {
            await uniPool.initialize(encodePriceSqrt('10', "1"))
        }
        const uniFeeRatio = await uniPool.fee()
        await uniPool.increaseObservationCardinalityNext(500)
        await marketRegistry.addPool(vMAYC.address, uniFeeRatio)
        await exchange.setMaxTickCrossedWithinBlock(vMAYC.address, maxTickCrossedWithinBlock)
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});