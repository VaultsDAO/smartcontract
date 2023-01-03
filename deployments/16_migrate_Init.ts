import fs from "fs";

import hre, { ethers } from "hardhat";

import { UniswapV3Pool } from "../typechain/UniswapV3Pool";
import { parseUnits } from "ethers/lib/utils";


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
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    const ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse");
    const QuoteToken = await hre.ethers.getContractFactory("QuoteToken");
    const BaseToken = await hre.ethers.getContractFactory("BaseToken");

    const TestAggregatorV3 = await hre.ethers.getContractFactory("TestAggregatorV3")
    const ChainlinkPriceFeedV2 = await hre.ethers.getContractFactory("ChainlinkPriceFeedV2")


    // deploy UniV3 factory
    var uniswapV3Factory = await hre.ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
    var clearingHouseConfig = await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address);
    var marketRegistry = await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address);
    var orderBook = await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address);
    var accountBalance = await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address);
    var exchange = await hre.ethers.getContractAt('Exchange', deployData.exchange.address);
    var insuranceFund = await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address);
    var vault = await hre.ethers.getContractAt('Vault', deployData.vault.address);
    var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address);
    var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);

    var uniFeeTier = 10000

    const uniswapV3Pool = await hre.ethers.getContractFactory("UniswapV3Pool")

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

    // deploy vault
    await collateralManager.addCollateral(deployData.wETH.address, {
        priceFeed: deployData.priceFeedETH.address,
        collateralRatio: (0.8e6).toString(),
        discountRatio: (0.5e6).toString(),
        depositCap: parseUnits("1000", deployData.wETH.decimals),
    })
    await collateralManager.addCollateral(deployData.wBTC.address, {
        priceFeed: deployData.priceFeedBTC.address,
        collateralRatio: (0.8e6).toString(),
        discountRatio: (0.5e6).toString(),
        depositCap: parseUnits("1000", deployData.wBTC.decimals),
    })

    var vUSD = await QuoteToken.attach(deployData.quoteToken.address)

    var vETH = await BaseToken.attach(deployData.vETH.address)
    const poolETHAddr = await uniswapV3Factory.getPool(deployData.vETH.address, deployData.quoteToken.address, uniFeeTier)
    if (poolETHAddr.toString() == "0x0000000000000000000000000000000000000000") {
        await uniswapV3Factory.createPool(deployData.vETH.address, deployData.quoteToken.address, uniFeeTier)
    }
    const poolETH = uniswapV3Pool.attach(poolETHAddr) as UniswapV3Pool
    await vETH.addWhitelist(poolETH.address)
    await vUSD.addWhitelist(poolETH.address)

    var vBTC = await BaseToken.attach(deployData.vBTC.address)
    const poolBTCAddr = await uniswapV3Factory.getPool(deployData.vBTC.address, deployData.quoteToken.address, uniFeeTier)
    if (poolBTCAddr.toString() == "0x0000000000000000000000000000000000000000") {
        await uniswapV3Factory.createPool(deployData.vBTC.address, deployData.quoteToken.address, uniFeeTier)
    }
    const poolBTC = uniswapV3Pool.attach(poolBTCAddr) as UniswapV3Pool
    await vBTC.addWhitelist(poolBTC.address)
    await vBTC.addWhitelist(poolBTC.address)

    // deploy clearingHouse

    console.log((await vETH.balanceOf(clearingHouse.address)).toString())
    console.log((await vBTC.balanceOf(clearingHouse.address)).toString())

    await vUSD.addWhitelist(clearingHouse.address)
    await vETH.addWhitelist(clearingHouse.address)
    await vBTC.addWhitelist(clearingHouse.address)
    await vUSD.mintMaximumTo(clearingHouse.address)
    await vETH.mintMaximumTo(clearingHouse.address)
    await vBTC.mintMaximumTo(clearingHouse.address)

    console.log((await vETH.balanceOf(clearingHouse.address)).toString())
    console.log((await vBTC.balanceOf(clearingHouse.address)).toString())
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});