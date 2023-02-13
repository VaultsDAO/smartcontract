import fs from "fs";

import hre, { ethers } from "hardhat";

import bn from "bignumber.js"

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../test/shared/utilities";
import { AccountBalance, BaseToken, Exchange, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, TestERC20, UniswapV3Pool, Vault } from "../typechain";
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

    var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

    var depositForTrader = async function name(trader: SignerWithAddress) {
        let balance = await vault.getBalanceByToken(trader.address, wETH.address)
        let owedRealizedPnl = (await accountBalance.getPnlAndPendingFee(trader.address))[0]
        balance = balance.add(owedRealizedPnl)
        if (balance.lt(parseEther('1.5'))) {
            await waitForTx(
                await vault.connect(trader).depositEther({ value: parseEther('2').sub(balance) }),
                'vault.depositEther(' + wETH.address + ', ' + formatEther(parseEther('2').sub(balance)) + ')'
            )
        }
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

        console.log(
            'before trade',
            baseToken.address,
            markTwap.toString(),
            indexPrice.toString(),
        )

        let rndAmount = ((Math.floor(Math.random() * 1000000) % 6) + 5) * 0.025
        var isBaseToQuote = true

        if (markTwap.gt(indexPrice)) {
            isBaseToQuote = true
        } else {
            isBaseToQuote = false
        }
        if ((await exchange.getInsuranceFundFeeRatio(baseToken.address, isBaseToQuote)).gt(1000)) {
            isBaseToQuote = !isBaseToQuote
        }

        await depositForTrader(miner)
        await waitForTx(
            await clearingHouse.connect(miner).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: isBaseToQuote,
                isExactInput: !isBaseToQuote,
                oppositeAmountBound: 0,
                amount: parseEther(rndAmount.toString()),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            }),
            'clearingHouse.connect(trader).openPosition isBaseToQuote = ' + isBaseToQuote,
        )

        markTwapX96 = await exchange.getSqrtMarkTwapX96(baseToken.address, 0)
        markTwap = new bn(formatSqrtPriceX96ToPrice(markTwapX96, 18))
        indexPrice = new bn(formatEther((await baseToken.getIndexPrice(0))))
        console.log(
            'after trade',
            baseToken.address,
            markTwap.toString(),
            indexPrice.toString(),
        )
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
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});