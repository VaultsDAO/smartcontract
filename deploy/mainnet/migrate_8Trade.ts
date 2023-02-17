import fs from "fs";

import hre, { ethers } from "hardhat";

import bn from "bignumber.js"

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, Exchange, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, TestERC20, UniswapV3Pool, Vault } from "../../typechain";
import { getMaxTickRange } from "../../test/helper/number";
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
    let fileName = process.cwd() + '/deploy/mainnet/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 

    const [admin, maker, priceAdmin, platformFund, trader1, trader2, trader3, trader4] = await ethers.getSigners()

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
        if (balance.lt(parseEther('10000'))) {
            await waitForTx(
                await wETH.connect(admin).mint(trader.address, parseEther('10000').sub(balance)),
                'wETH.mint(' + vault.address + ', ' + formatEther(parseEther('10000').sub(balance)) + ')'
            )
            await waitForTx(
                await wETH.connect(trader).approve(vault.address, ethers.constants.MaxUint256),
                'wETH.approve(' + vault.address + ', ethers.constants.MaxUint256)'
            )
            await waitForTx(
                await vault.connect(trader).deposit(wETH.address, parseEther('10000').sub(balance)),
                'vault.deposit(' + wETH.address + ', ' + formatEther(parseEther('10000').sub(balance)) + ')'
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
        console.log(
            'before trade',
            baseToken.address,
            markTwap.toString(),
            indexPrice.toString(),
        )

        var tickRate = 0.0001;

        let rndInt = (Math.floor(Math.random() * 1000000) % 50) + 1
        let trader: SignerWithAddress

        if (markTwap.gt(indexPrice)) {
            let newPrice = (markTwap.multipliedBy(1 - tickRate * rndInt))
            for (let idx = 0; idx < 10; idx++) {
                let rndTrader = Math.floor(Math.random() * 1000000) % 4 + 1
                if (rndTrader == 1) {
                    trader = trader1
                } else if (rndTrader == 2) {
                    trader = trader2
                } else if (rndTrader == 3) {
                    trader = trader3
                } else if (rndTrader == 4) {
                    trader = trader4
                }
                let takerOpenNotional = await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)
                if (takerOpenNotional.gt(parseEther('200'))) {
                    continue
                }
                break
            }
            await depositForTrader(trader)
            await waitForTx(
                await clearingHouse.connect(trader).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: ethers.constants.MaxUint256.div(1e10),
                    sqrtPriceLimitX96: encodePriceSqrt(newPrice.toString(), '1'),
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                }),
                'clearingHouse.connect(trader).openPosition short'
            )
        } else {
            let newPrice = (markTwap.multipliedBy(1 + tickRate * rndInt))
            for (let idx = 0; idx < 10; idx++) {
                let rndTrader = Math.floor(Math.random() * 1000000) % 4 + 1
                if (rndTrader == 1) {
                    trader = trader1
                } else if (rndTrader == 2) {
                    trader = trader2
                } else if (rndTrader == 3) {
                    trader = trader3
                } else if (rndTrader == 4) {
                    trader = trader4
                }
                let takerOpenNotional = await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)
                if (takerOpenNotional.lt(parseEther('-200'))) {
                    continue
                }
                break
            }
            await depositForTrader(trader)
            await waitForTx(
                await clearingHouse.connect(trader).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: ethers.constants.MaxUint256.div(1e10),
                    sqrtPriceLimitX96: encodePriceSqrt(newPrice.toString(), '1'),
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                }),
                'clearingHouse.connect(trader).openPosition long'
            )
        }
        markTwapX96 = await exchange.getSqrtMarkTwapX96(baseToken.address, 0)
        markTwap = new bn(formatSqrtPriceX96ToPrice(markTwapX96, 18))
        indexPrice = new bn(formatEther((await baseToken.getIndexPrice(0))))
        console.log(
            'after trade',
            baseToken.address,
            markTwap.toString(),
            indexPrice.toString(),
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});