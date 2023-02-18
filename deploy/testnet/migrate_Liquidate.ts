import fs from "fs";

import hre, { ethers } from "hardhat";

import bn from "bignumber.js"

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, Exchange, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, TestERC20, UniswapV3Pool, Vault } from "../../typechain";
import { getMaxTickRange } from "../../test/helper/number";
import helpers from "../helpers";
import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";
import BigNumber from "bignumber.js";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
const { waitForTx, tryWaitForTx, loadDB } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 

    const [admin, maker, priceAdmin, platformFund, trader1, trader2, trader3, trader4, liquidator] = await ethers.getSigners()

    // deploy UniV3 factory
    var uniswapV3Factory = await hre.ethers.getContractAt('UniswapV3Factory', deployData.uniswapV3Factory.address);
    var clearingHouseConfig = await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address);
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = (await hre.ethers.getContractAt('Exchange', deployData.exchange.address)) as Exchange;
    var insuranceFund = await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address);
    var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
    var collateralManager = await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address);
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;

    var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

    var baseTokenAddr = deployData.vBAYC.address
    var traderAddr = '0x.....'

    let isLiquidatable = await clearingHouse.isLiquidatable(traderAddr)

    console.log(
        '------------------------',
        baseTokenAddr,
        baseTokenAddr,
        '------------------------',
        isLiquidatable,
    )

    if (isLiquidatable) {
        // only liquidate if fee < 0.5%
        if ((await exchange.getInsuranceFundFeeRatio(baseTokenAddr, true)).lt(5000) && (await exchange.getInsuranceFundFeeRatio(baseTokenAddr, false)).lt(5000)) {

            let buyingPower = (await vault.getFreeCollateral(liquidator.address)).mul(5).mul(80).div(100).abs() // use 80% balance
            let positionValue = (await accountBalance.getTotalPositionValue(traderAddr, baseTokenAddr)).abs()
            let positionSize = (await accountBalance.getTotalPositionSize(traderAddr, baseTokenAddr))
            let liqPositionSize = positionSize
            // update liqPositionSize if buyingPower < positionValue
            
            // var isBaseToQuote = liqPositionSize.gt(0) ? true : false
            // let relaySwapResp = await exchange.estimateSwap({
            //     baseToken: baseTokenAddr,
            //     isBaseToQuote: isBaseToQuote,
            //     isExactInput: !isBaseToQuote,
            //     oppositeAmountBound: 0,
            //     amount: ethers.constants.MaxUint256.div(1e10),
            //     sqrtPriceLimitX96: encodePriceSqrt(limitPrice.toString(), '1'),
            //     deadline: ethers.constants.MaxUint256,
            //     referralCode: ethers.constants.HashZero,
            // })

            if (buyingPower.lt(positionValue)) {
                liqPositionSize = liqPositionSize.mul(buyingPower).div(positionValue)
            }
            if (!liqPositionSize.eq(0)) {
                // liquidate with liqPositionSize
                await waitForTx(
                    await clearingHouse.connect(liquidator).liquidate(traderAddr, baseTokenAddr, liqPositionSize),
                    'clearingHouse.connect(liquidator).liquidate ' + formatEther(liqPositionSize),
                )
            }
            // close after liquidate
            if (!(await accountBalance.getTotalPositionSize(traderAddr, baseTokenAddr)).eq(0)) {
                await waitForTx(
                    await clearingHouse.connect(liquidator).closePosition({
                        baseToken: baseTokenAddr,
                        sqrtPriceLimitX96: parseEther("0"),
                        oppositeAmountBound: parseEther("0"),
                        deadline: ethers.constants.MaxUint256,
                        referralCode: ethers.constants.HashZero,
                    }),
                    'clearingHouse.connect(liquidator).closePosition'
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