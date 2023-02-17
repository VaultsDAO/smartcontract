import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, Exchange, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, UniswapV3Pool } from "../../typechain";
import { getMaxTickRange } from "../../test/helper/number";
import helpers from "./helpers";
import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deploy/mainnet/address/deployed_' + network + '.json';
    let deployData: DeployData;
    {
        if (!(await fs.existsSync(fileName))) {
            throw 'deployed file is not existsed'
        }
        let dataText = await fs.readFileSync(fileName)
        deployData = JSON.parse(dataText.toString())
    }
    let priceData: PriceData;
    {
        let dataText = await fs.readFileSync(process.cwd() + '/deploy/mainnet/address/prices.json')
        priceData = JSON.parse(dataText.toString())
    }
    // 

    const [admin, maker, priceAdmin] = await ethers.getSigners()

    // deploy UniV3 factory
    var uniswapV3Factory = await hre.ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
    var clearingHouseConfig = await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address);
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = (await hre.ethers.getContractAt('Exchange', deployData.exchange.address)) as Exchange;
    var insuranceFund = await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address);
    var vault = await hre.ethers.getContractAt('Vault', deployData.vault.address);
    var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address);
    var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);

    const vETH = (await ethers.getContractAt('QuoteToken', deployData.vETH.address)) as QuoteToken;

    var uniFeeTier = "3000" // 0.3%

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
    let priceKeys = [
        'priceBAYC',
        'priceMAYC',
        'priceCRYPTOPUNKS',
        'priceMOONBIRD',
        'priceAZUKI',
        'priceCLONEX',
        'priceDOODLE'
    ];
    for (let i = 0; i < 7; i++) {
        console.log(
            '--------------------------------------',
            priceKeys[i].substring(5),
            '--------------------------------------',
        )
        var baseTokenAddress = baseTokens[i].address
        var nftPriceFeedAddress = nftPriceFeeds[i].address
        var initPrice = formatEther(priceData[priceKeys[i]]);

        const baseToken = (await ethers.getContractAt('BaseToken', baseTokenAddress)) as BaseToken;

        // oracle price
        {
            var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', nftPriceFeedAddress)) as NftPriceFeed;
            if ((await priceFeed.priceFeedAdmin()).toLowerCase() != priceAdmin.address.toLowerCase()) {
                await waitForTx(
                    await priceFeed.setPriceFeedAdmin(priceAdmin.address),
                    'priceFeed.setPriceFeedAdmin(priceAdmin.address)'
                )
            }
            if (!(await priceFeed.getPrice(0)).eq(parseEther(initPrice))) {
                await waitForTx(
                    await priceFeed.connect(priceAdmin).setPrice(parseEther(initPrice)),
                    'priceFeed.connect(priceAdmin).setPrice(parseEther(price))'
                )
            }
        }
        // deploy clearingHouse
        {
            if (!(await baseToken.isInWhitelist(clearingHouse.address))) {
                await waitForTx(await baseToken.addWhitelist(clearingHouse.address),
                    'baseToken.addWhitelist(clearingHouse.address)')
            }
            if (!(await baseToken.totalSupply()).eq(ethers.constants.MaxUint256)) {
                await waitForTx(await baseToken.mintMaximumTo(clearingHouse.address),
                    'baseToken.mintMaximumTo(clearingHouse.address)')
            }
        }
        {
            // setting pool
            let poolAddr = await uniswapV3Factory.getPool(baseToken.address, vETH.address, uniFeeTier)
            if (poolAddr == ethers.constants.AddressZero) {
                await waitForTx(await uniswapV3Factory.createPool(baseToken.address, vETH.address, uniFeeTier),
                    'uniswapV3Factory.createPool(baseToken.address, vETH.address, uniFeeTier)')
            }
            poolAddr = uniswapV3Factory.getPool(baseToken.address, vETH.address, uniFeeTier)
            const uniPool = await ethers.getContractAt('UniswapV3Pool', poolAddr);
            if (!(await baseToken.isInWhitelist(uniPool.address))) {
                await waitForTx(await baseToken.addWhitelist(uniPool.address),
                    'baseToken.addWhitelist(uniPool.address)')
            }
            if (!(await vETH.isInWhitelist(uniPool.address))) {
                await waitForTx(await vETH.addWhitelist(uniPool.address),
                    'vETH.addWhitelist(uniPool.address)')
            }
            await tryWaitForTx(
                await uniPool.initialize(encodePriceSqrt(initPrice, "1")),
                'uniPool.initialize(encodePriceSqrt(price, "1"))'
            )
            await tryWaitForTx(
                await uniPool.increaseObservationCardinalityNext((2 ^ 16) - 1),
                'uniPool.increaseObservationCardinalityNext((2 ^ 16) - 1)'
            )
            if (!(await marketRegistry.hasPool(baseToken.address))) {
                const uniFeeRatio = await uniPool.fee()
                await tryWaitForTx(
                    await marketRegistry.addPool(baseToken.address, uniFeeRatio),
                    'marketRegistry.addPool(baseToken.address, uniFeeRatio)'
                )
            }
        }
        {
            var maxTickCrossedWithinBlock: number = 100
            if ((await exchange.getMaxTickCrossedWithinBlock(baseToken.address)).toString() != maxTickCrossedWithinBlock.toString()) {
                await tryWaitForTx(
                    await exchange.setMaxTickCrossedWithinBlock(baseToken.address, maxTickCrossedWithinBlock),
                    'exchange.setMaxTickCrossedWithinBlock(baseToken.address, maxTickCrossedWithinBlock)'
                )
            }
            if ((await marketRegistry.getInsuranceFundFeeRatio(baseToken.address)).toString() != '500') {
                await waitForTx(
                    await marketRegistry.setInsuranceFundFeeRatio(baseToken.address, '500'),
                    'marketRegistry.setInsuranceFundFeeRatio(baseToken.address, 500)'
                )
            }
            if ((await marketRegistry.getPlatformFundFeeRatio(baseToken.address)).toString() != '2000') {
                await waitForTx(
                    await marketRegistry.setPlatformFundFeeRatio(baseToken.address, '2000'),
                    'marketRegistry.setInsuranceFundFeeRatio(baseToken.address, 2000)'
                )
            }
            if ((await marketRegistry.getOptimalDeltaTwapRatio(baseToken.address)).toString() != '30000') {
                await waitForTx(
                    await marketRegistry.setOptimalDeltaTwapRatio(baseToken.address, '30000'),
                    'marketRegistry.setOptimalDeltaTwapRatio(baseToken.address, 30000)'
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