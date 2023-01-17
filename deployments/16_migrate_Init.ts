import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../test/shared/utilities";
import { AccountBalance, BaseToken, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, UniswapV3Pool } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;


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

    const [admin, maker, priceAdmin, trader, liquidator, platformFund] = await ethers.getSigners()

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
    const vBAYC = (await ethers.getContractAt('BaseToken', deployData.vBAYC.address)) as BaseToken;
    const vMAYC = (await ethers.getContractAt('BaseToken', deployData.vMAYC.address)) as BaseToken;

    await waitForTx(await exchange.setAccountBalance(accountBalance.address))
    await waitForTx(await orderBook.setExchange(exchange.address))
    await waitForTx(await vault.setCollateralManager(collateralManager.address))
    await waitForTx(await insuranceFund.setVault(vault.address))
    await waitForTx(await accountBalance.setVault(vault.address))
    await waitForTx(await clearingHouseConfig.setSettlementTokenBalanceCap(ethers.constants.MaxUint256))
    await waitForTx(await marketRegistry.setClearingHouse(clearingHouse.address))
    await waitForTx(await orderBook.setClearingHouse(clearingHouse.address))
    await waitForTx(await exchange.setClearingHouse(clearingHouse.address))
    await waitForTx(await accountBalance.setClearingHouse(clearingHouse.address))
    await waitForTx(await vault.setClearingHouse(clearingHouse.address))
    if (network == 'arbitrum') {
        await waitForTx(await vault.setWETH9(deployData.wETH.address))
    }
    // setting pool
    {
        let poolBAYCAddr = await uniswapV3Factory.getPool(vBAYC.address, vETH.address, uniFeeTier)
        if (poolBAYCAddr == ethers.constants.AddressZero) {
            await waitForTx(await uniswapV3Factory.createPool(deployData.vBAYC.address, deployData.vETH.address, uniFeeTier), 'uniswapV3Factory.createPool(deployData.vBAYC.address, deployData.vETH.address, uniFeeTier)')
        }
        poolBAYCAddr = uniswapV3Factory.getPool(vBAYC.address, vETH.address, uniFeeTier)
        const poolBAYC = await ethers.getContractAt('UniswapV3Pool', poolBAYCAddr);
        if (!(await vBAYC.isInWhitelist(poolBAYC.address))) {
            await waitForTx(await vBAYC.addWhitelist(poolBAYC.address), 'vBAYC.addWhitelist(poolBAYC.address)')
        }
        if (!(await vETH.isInWhitelist(poolBAYC.address))) {
            await waitForTx(await vETH.addWhitelist(poolBAYC.address), 'vETH.addWhitelist(poolBAYC.address)')
        }
    }
    {
        let poolMAYCAddr = await uniswapV3Factory.getPool(vMAYC.address, vETH.address, uniFeeTier)
        if (poolMAYCAddr == ethers.constants.AddressZero) {
            await waitForTx(await uniswapV3Factory.createPool(deployData.vMAYC.address, deployData.vETH.address, uniFeeTier), 'uniswapV3Factory.createPool(deployData.vMAYC.address, deployData.vETH.address, uniFeeTier)')
        }
        poolMAYCAddr = await uniswapV3Factory.getPool(vMAYC.address, vETH.address, uniFeeTier)
        const poolMAYC = await ethers.getContractAt('UniswapV3Pool', poolMAYCAddr);
        if (!(await vMAYC.isInWhitelist(poolMAYC.address))) {
            await waitForTx(await vMAYC.addWhitelist(poolMAYC.address), 'vMAYC.addWhitelist(poolMAYC.address)')
        }
        if (!(await vETH.isInWhitelist(poolMAYC.address))) {
            await waitForTx(await vETH.addWhitelist(poolMAYC.address), 'vETH.addWhitelist(poolMAYC.address)')
        }
    }
    // deploy clearingHouse
    if (!(await vETH.isInWhitelist(clearingHouse.address))) {
        await waitForTx(await vETH.addWhitelist(clearingHouse.address), 'vETH.addWhitelist(clearingHouse.address)')
    }
    if (!(await vBAYC.isInWhitelist(clearingHouse.address))) {
        await waitForTx(await vBAYC.addWhitelist(clearingHouse.address), 'vBAYC.addWhitelist(clearingHouse.address)')
    }
    if (!(await vMAYC.isInWhitelist(clearingHouse.address))) {
        await waitForTx(await vMAYC.addWhitelist(clearingHouse.address), 'vMAYC.addWhitelist(clearingHouse.address)')
    }

    if (!(await vETH.totalSupply()).eq(ethers.constants.MaxUint256)) {
        await waitForTx(await vETH.mintMaximumTo(clearingHouse.address), 'vMAYC.mintMaximumTo(clearingHouse.address)')
    }
    if (!(await vBAYC.totalSupply()).eq(ethers.constants.MaxUint256)) {
        await waitForTx(await vBAYC.mintMaximumTo(clearingHouse.address), 'vMAYC.mintMaximumTo(clearingHouse.address)')
    }
    if (!(await vMAYC.totalSupply()).eq(ethers.constants.MaxUint256)) {
        await waitForTx(await vMAYC.mintMaximumTo(clearingHouse.address), 'vMAYC.mintMaximumTo(clearingHouse.address)')
    }

    // initMarket
    var maxTickCrossedWithinBlock: number = getMaxTickRange()
    // vBAYC
    {
        const poolAddr = await uniswapV3Factory.getPool(vBAYC.address, vETH.address, uniFeeTier)
        const uniPool = (await ethers.getContractAt('UniswapV3Pool', poolAddr) as UniswapV3Pool);
        if (network == 'local') {
            await tryWaitForTx(await uniPool.initialize(encodePriceSqrt("100", "1")), 'uniPool.initialize(encodePriceSqrt("100", "1"))')
        } else {
            await tryWaitForTx(await uniPool.initialize(encodePriceSqrt("73.8388", "1")), 'uniPool.initialize(encodePriceSqrt("73.8388", "1"))')
        }
        await tryWaitForTx(await uniPool.increaseObservationCardinalityNext(500), 'uniPool.increaseObservationCardinalityNext(500)')
        if (!(await marketRegistry.hasPool(vBAYC.address))) {
            const uniFeeRatio = await uniPool.fee()
            await tryWaitForTx(await marketRegistry.addPool(vBAYC.address, uniFeeRatio), 'marketRegistry.addPool(vBAYC.address, uniFeeRatio)')
        }
        await tryWaitForTx(await exchange.setMaxTickCrossedWithinBlock(vBAYC.address, maxTickCrossedWithinBlock), 'exchange.setMaxTickCrossedWithinBlock(vBAYC.address, maxTickCrossedWithinBlock)')
    }
    // vMAYC
    {
        const poolAddr = await uniswapV3Factory.getPool(vMAYC.address, vETH.address, uniFeeTier)
        const uniPool = (await ethers.getContractAt('UniswapV3Pool', poolAddr) as UniswapV3Pool);
        if (network == 'local') {
            await tryWaitForTx(await uniPool.initialize(encodePriceSqrt("100", "1")), 'uniPool.initialize(encodePriceSqrt("100", "1"))')
        } else {
            await tryWaitForTx(await uniPool.initialize(encodePriceSqrt("15.899", "1")), 'uniPool.initialize(encodePriceSqrt("15.899", "1"))')
        }
        await tryWaitForTx(await uniPool.increaseObservationCardinalityNext(500), 'uniPool.increaseObservationCardinalityNext')
        if (!(await marketRegistry.hasPool(vMAYC.address))) {
            const uniFeeRatio = await uniPool.fee()
            await waitForTx(await marketRegistry.addPool(vMAYC.address, uniFeeRatio), 'marketRegistry.addPool(vMAYC.address, uniFeeRatio)')
        }
        await tryWaitForTx(await exchange.setMaxTickCrossedWithinBlock(vMAYC.address, maxTickCrossedWithinBlock), 'exchange.setMaxTickCrossedWithinBlock(vMAYC.address, maxTickCrossedWithinBlock)')
    }
    // oracle price
    {
        var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address)) as NftPriceFeed;
        await waitForTx(
            await priceFeed.setPriceFeedAdmin(priceAdmin.address)
        )
        await waitForTx(
            await priceFeed.connect(priceAdmin).setPrice(parseEther('73.8388'))
        )
    }
    {
        var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address)) as NftPriceFeed;
        await waitForTx(
            await priceFeed.setPriceFeedAdmin(priceAdmin.address)
        )
        await waitForTx(
            await priceFeed.connect(priceAdmin).setPrice(parseEther('15.899'))
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});