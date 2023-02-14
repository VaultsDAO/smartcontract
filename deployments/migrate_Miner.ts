import fs from "fs";

import hre, { ethers } from "hardhat";

import bn from "bignumber.js"

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../test/shared/utilities";
import { AccountBalance, BaseToken, Exchange, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, RewardMiner, TestERC20, UniswapV3Pool, Vault } from "../typechain";
import { getMaxTickRange } from "../test/helper/number";
import helpers from "./helpers";
import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";
import BigNumber from "bignumber.js";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
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

    const [admin, maker, priceAdmin, platformFund, trader1, trader2, trader3, trader4, miner] = await ethers.getSigners()

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
    var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);
    var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address);

    var rewardMiner = (await hre.ethers.getContractAt('RewardMiner', deployData.rewardMiner.address)) as RewardMiner;

    var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

    var depositForTrader = async function name(trader: SignerWithAddress) {
        {
            let platformFundBalance = await vault.getFreeCollateralByToken(platformFund.address, wETH.address)
            platformFundBalance = platformFundBalance.div(1e15).mul(1e15)
            if (platformFundBalance.gt(parseEther('1'))) {
                await waitForTx(
                    await vault.connect(platformFund).withdrawEther(platformFundBalance),
                    'vault.connect(platformFund).withdrawEther(' + formatEther(platformFundBalance) + ')'
                )
            }
            platformFundBalance = await ethers.provider.getBalance(platformFund.address)
            platformFundBalance = platformFundBalance.div(1e15).mul(1e15)
            if (platformFundBalance.gt(parseEther('0.1'))) {
                await waitForTx(
                    await vault.connect(platformFund).depositEtherFor(trader.address, { value: platformFundBalance.sub(parseEther('0.1')) }),
                    'vault.connect(platformFund).depositEtherFor(' + trader.address + ')'
                )
            }
        }
    }

    await depositForTrader(miner)

    let tickAmount = parseEther('0.01');
    let minerData = await rewardMiner.getCurrentPeriodInfoTrader(miner.address)
    if (minerData.traderAmount.lt(minerData.amount.div(3))) {
        let deltaAmount = minerData.amount.div(3).sub(minerData.traderAmount)
        tickAmount = deltaAmount.div(7).div(2).div(8)
        tickAmount = tickAmount.div(1e15).mul(1e15)
    }

    if (tickAmount.gt(parseEther('0.45'))) {
        tickAmount = parseEther('0.45')
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
    for (let i = 0; i < baseTokens.length; i++) {
        var baseTokenAddress = baseTokens[i].address
        const baseToken = (await ethers.getContractAt('BaseToken', baseTokenAddress)) as BaseToken;

        console.log(
            '------------------------',
            baseToken.address,
            '------------------------',
        )

        if ((await exchange.getInsuranceFundFeeRatio(baseToken.address, true)).eq(500) && (await exchange.getInsuranceFundFeeRatio(baseToken.address, false)).eq(500)) {
            let markTwapX96 = await exchange.getSqrtMarkTwapX96(baseToken.address, 0)
            let markTwap = new bn(formatSqrtPriceX96ToPrice(markTwapX96, 18))
            let indexPrice = new bn(formatEther((await baseToken.getIndexPrice(0))))

            if (!(await accountBalance.getTotalPositionSize(miner.address, baseToken.address)).eq(0)) {
                await waitForTx(
                    await clearingHouse.connect(miner).closePosition({
                        baseToken: baseToken.address,
                        sqrtPriceLimitX96: parseEther("0"),
                        oppositeAmountBound: parseEther("0"),
                        deadline: ethers.constants.MaxUint256,
                        referralCode: ethers.constants.HashZero,
                    }),
                    'clearingHouse.connect(trader).closePosition'
                )
            }

            var isBaseToQuote = true
            if (markTwap.gt(indexPrice)) {
                isBaseToQuote = true
            } else {
                isBaseToQuote = false
            }

            let rndAmount = tickAmount.mul(((Math.floor(Math.random() * 1000000) % 6) + 5))

            await waitForTx(
                await clearingHouse.connect(miner).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: isBaseToQuote,
                    isExactInput: !isBaseToQuote,
                    oppositeAmountBound: 0,
                    amount: rndAmount,
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                }),
                'clearingHouse.connect(trader).openPosition isBaseToQuote = ' + isBaseToQuote + ' ' + rndAmount.toString(),
            )
            await waitForTx(
                await clearingHouse.connect(miner).closePosition({
                    baseToken: baseToken.address,
                    sqrtPriceLimitX96: parseEther("0"),
                    oppositeAmountBound: parseEther("0"),
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                }),
                'clearingHouse.connect(trader).closePosition'
            )
        }
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});