import fs from "fs";

import hre, { ethers, waffle } from "hardhat";

import { UniswapV3Pool } from "../typechain/UniswapV3Pool";
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils";
import { encodePriceSqrt } from "../test/shared/utilities";
import { AccountBalance, MarketRegistry, OrderBook, TestERC20 } from "../typechain";


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
        const [admin] = await ethers.getSigners()

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

        var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;
        var vUSD = await QuoteToken.attach(deployData.vUSD.address)
        var vBAYC = await BaseToken.attach(deployData.vBAYC.address)
        var vMAYC = await BaseToken.attach(deployData.vMAYC.address)
        var uniFeeTier = 3000 // 0.3%
        // vBAYC
        {
            const poolAddr = await uniswapV3Factory.getPool(vBAYC.address, vUSD.address, uniFeeTier)
            const uniPool = await hre.ethers.getContractAt('UniswapV3Pool', poolAddr);
            await uniPool.initialize(encodePriceSqrt('100', "1"))
            console.log('uniPool.initialize is deployed', uniPool.address)
        }
        // vMAYC
        {
            const poolAddr = await uniswapV3Factory.getPool(vMAYC.address, vUSD.address, uniFeeTier)
            const uniPool = await hre.ethers.getContractAt('UniswapV3Pool', poolAddr);
            await uniPool.initialize(encodePriceSqrt('100', "1"))
            console.log('uniPool.initialize is deployed', uniPool.address)
        }
        {
            var priceFeed = await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedBAYC.address);
            await priceFeed.setPrice(parseEther('100'))
            console.log('uniPool.setPrice is deployed', priceFeed.address)
        }
        {
            var priceFeed = await hre.ethers.getContractAt('NftPriceFeed', deployData.nftPriceFeedMAYC.address);
            await priceFeed.setPrice(parseEther('100'))
            console.log('uniPool.setPrice is deployed', priceFeed.address)
        }

        const lowerTick: number = 45800
        const upperTick: number = 46400

        if (!deployData.testCheck.addLiquidity) {
            await (
                await clearingHouse.addLiquidity({
                    baseToken: vBAYC.address,
                    base: parseEther("100"),
                    quote: parseEther("1000"),
                    lowerTick,
                    upperTick,
                    minBase: 0,
                    minQuote: 0,
                    useTakerBalance: false,
                    deadline: ethers.constants.MaxUint256,
                })
            ).wait()
            deployData.testCheck.addLiquidity = true
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('clearingHouse.addLiquidity is deployed', clearingHouse.address)
        }
        // if (!deployData.testCheck.deposit) {
        //     await wETH.mint(admin.address, parseUnits("10", await wETH.decimals()))

        //     deployData.testCheck.deposit = true
        //     await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        //     console.log('wETH.mint is deployed', wETH.address)
        // }
        // if (!deployData.testCheck.openPosition) {

        //     deployData.testCheck.openPosition = true
        //     await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        //     console.log('clearingHouse.openPosition is deployed', clearingHouse.address)
        // }

        // if (!deployData.testCheck.closePosition) {

        //     deployData.testCheck.closePosition = true
        //     await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        //     console.log('clearingHouse.closePosition is deployed', clearingHouse.address)
        // }

        // if (!deployData.testCheck.removeLiquidity) {
        //     await (
        //         await clearingHouse.removeLiquidity({
        //             baseToken: vBAYC.address,
        //             lowerTick,
        //             upperTick,
        //             liquidity: (
        //                 await orderBook.getOpenOrder(admin.address, wETH.address, lowerTick, upperTick)
        //             ).liquidity,
        //             minBase: parseEther("0"),
        //             minQuote: parseEther("0"),
        //             deadline: ethers.constants.MaxUint256,
        //         })
        //     ).wait()

        //     deployData.testCheck.removeLiquidity = true
        //     await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        //     console.log('clearingHouse.removeLiquidity is deployed', clearingHouse.address)
        // }
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});