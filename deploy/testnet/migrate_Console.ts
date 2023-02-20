import fs from "fs";

import bn from "bignumber.js"

import hre, { ethers } from "hardhat";

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, ClearingHouseConfig, CollateralManager, Exchange, GenericLogic, InsuranceFund, MarketRegistry, MockPNFTToken, NftPriceFeed, OrderBook, QuoteToken, RewardMiner, TestERC20, TestFaucet, UniswapV3Pool, Vault } from "../../typechain";
import { getMaxTickRange, priceToTick } from "../../test/helper/number";
import helpers from "../helpers";
import { formatEther, parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx, loadDB, saveDB } = helpers;

import migrateAdmin from "./1_migrate_Admin";
import migratePriceFeedAll from "./2_migrate_PriceFeed_All";
import migrateTokens from "./3_migrate_Tokens";
import migrateQuoteToken from "./4_migrate_QuoteToken";
import migrateBaseTokenAll from "./5_migrate_BaseToken_All";
import migrateLibrary from "./6_migrate_Library";
import migrateUniswapV3 from "./6_migrate_UniswapV3";
import migrateClearingHouseConfig from "./7_migrate_ClearingHouseConfig";
import migrateMarketRegistry from "./8_migrate_MarketRegistry";
import migrateOrderBook from "./9_migrate_OrderBook";
import migrateAccountBalance from "./10_migrate_AccountBalance";
import migrateExchange from "./11_migrate_Exchange";
import migrateInsuranceFund from "./12_migrate_InsuranceFund";
import migrateVault from "./13_migrate_Vault";
import migrateCollateralManager from "./14_migrate_CollateralManager";
import migrateClearingHouse from "./15_migrate_ClearingHouse";
import migratePNFTToken from "./20_migrate_PNFTToken";
import migrateRewardMiner from "./21_migrate_RewardMiner";
import { } from "../../test/helper/clearingHouseHelper";
import { providers } from "ethers";


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {

    console.log('START')

    // {
    //     console.log('migrateAdmin -- START --')
    //     await migrateAdmin();
    //     console.log('migrateAdmin -- END --')
    // }

    // {
    //     console.log('migratePriceFeedAll -- START --')
    //     await migratePriceFeedAll();
    //     console.log('migratePriceFeedAll -- END --')
    // }

    // // import migrateTokens from "./3_migrate_Tokens";
    // {
    //     console.log('migrateTokens -- START --')
    //     await migrateTokens();
    //     console.log('migrateTokens -- END --')
    // }

    // // import migrateQuoteToken from "./4_migrate_QuoteToken";
    // {
    //     console.log('migrateQuoteToken -- START --')
    //     await migrateQuoteToken();
    //     console.log('migrateQuoteToken -- END --')
    // }

    // // import migrateBaseTokenAll from "./5_migrate_BaseToken_All";
    // {
    //     console.log('migrateBaseTokenAll -- START --')
    //     await migrateBaseTokenAll();
    //     console.log('migrateBaseTokenAll -- END --')
    // }

    // // import migrateLibrary from "./6_migrate_Library";
    // {
    //     console.log('migrateLibrary -- START --')
    //     await migrateLibrary();
    //     console.log('migrateLibrary -- END --')
    // }

    // // import migrateUniswapV3 from "./6_migrate_UniswapV3";
    // {
    //     console.log('migrateUniswapV3 -- START --')
    //     await migrateUniswapV3();
    //     console.log('migrateUniswapV3 -- END --')
    // }

    // // import migrateClearingHouseConfig from "./7_migrate_ClearingHouseConfig";
    // {
    //     console.log('migrateClearingHouseConfig -- START --')
    //     await migrateClearingHouseConfig();
    //     console.log('migrateClearingHouseConfig -- END --')
    // }

    // // import migrateMarketRegistry from "./8_migrate_MarketRegistry";
    // {
    //     console.log('migrateMarketRegistry -- START --')
    //     await migrateMarketRegistry();
    //     console.log('migrateMarketRegistry -- END --')
    // }

    // // import migrateOrderBook from "./9_migrate_OrderBook";
    // {
    //     console.log('migrateOrderBook -- START --')
    //     await migrateOrderBook();
    //     console.log('migrateOrderBook -- END --')
    // }

    // // import migrateAccountBalance from "./10_migrate_AccountBalance";
    // {
    //     console.log('migrateAccountBalance -- START --')
    //     await migrateAccountBalance();
    //     console.log('migrateAccountBalance -- END --')
    // }

    // // import migrateExchange from "./11_migrate_Exchange";
    // {
    //     console.log('migrateExchange -- START --')
    //     await migrateExchange();
    //     console.log('migrateExchange -- END --')
    // }

    // // import migrateInsuranceFund from "./12_migrate_InsuranceFund";
    // {
    //     console.log('migrateInsuranceFund -- START --')
    //     await migrateInsuranceFund();
    //     console.log('migrateInsuranceFund -- END --')
    // }

    // // import migrateVault from "./13_migrate_Vault";
    // {
    //     console.log('migrateVault -- START --')
    //     await migrateVault();
    //     console.log('migrateVault -- END --')
    // }

    // // import migrateCollateralManager from "./14_migrate_CollateralManager";
    // {
    //     console.log('migrateCollateralManager -- START --')
    //     await migrateCollateralManager();
    //     console.log('migrateCollateralManager -- END --')
    // }

    // // import migrateClearingHouse from "./15_migrate_ClearingHouse";
    // {
    //     console.log('migrateClearingHouse -- START --')
    //     await migrateClearingHouse();
    //     console.log('migrateClearingHouse -- END --')
    // }

    // // import migratePNFTToken from "./20_migrate_PNFTToken";
    // {
    //     console.log('migratePNFTToken -- START --')
    //     await migratePNFTToken();
    //     console.log('migratePNFTToken -- END --')
    // }

    // // import migrateRewardMiner from "./21_migrate_RewardMiner";
    // {
    //     console.log('migrateRewardMiner -- START --')
    //     await migrateRewardMiner();
    //     console.log('migrateRewardMiner -- END --')
    // }

    // return


    const network = hre.network.name;
    let deployData = (await loadDB(network))
    let priceData: PriceData;
    {
        let dataText = await fs.readFileSync(process.cwd() + '/deploy/testnet/address/prices.json')
        priceData = JSON.parse(dataText.toString())
    }

    const [admin, maker, priceAdmin, platformFund, trader1, trader2, trader3, trader4, hieuq] = await ethers.getSigners()

    // deploy UniV3 factory
    var genericLogic = (await hre.ethers.getContractAt('GenericLogic', deployData.genericLogic.address)) as GenericLogic;
    var clearingHouseConfig = (await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address)) as ClearingHouseConfig;
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var orderBook = (await hre.ethers.getContractAt('OrderBook', deployData.orderBook.address)) as OrderBook;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var exchange = (await hre.ethers.getContractAt('Exchange', deployData.exchange.address) as Exchange);
    var insuranceFund = (await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address)) as InsuranceFund;
    var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
    var collateralManager = (await hre.ethers.getContractAt('CollateralManager', deployData.collateralManager.address)) as CollateralManager;
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;
    var rewardMiner = (await hre.ethers.getContractAt('RewardMiner', deployData.rewardMiner.address)) as RewardMiner;
    var pNFTToken = (await hre.ethers.getContractAt('MockPNFTToken', deployData.pNFTToken.address)) as MockPNFTToken;
    var testFaucet = (await hre.ethers.getContractAt('TestFaucet', deployData.testFaucet.address)) as TestFaucet;
    var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

    // {
    //     const eventTopic = clearingHouse.interface.getEventTopic(clearingHouse.interface.events["Repeg(uint256,uint256)"])
    //     console.log(eventTopic)
    //     var filter = {
    //         fromBlock: 0,
    //         toBlock: 'latest',
    //         address: clearingHouse.address,
    //         topics: [eventTopic]
    //     };
    //     let logs = await ethers.provider.getLogs(filter)
    //     logs.forEach(log => {
    //         console.log(log)
    //     });
    // }

    // let periodNumber = await rewardMiner.getPeriodNumber()
    // await rewardMiner.startPnlMiner(15, '666666')

    // console.log(
    //     'getStartPnlNumber',
    //     (await rewardMiner.getStartPnlNumber()).toString()
    // )

    let minerData = await rewardMiner.getCurrentPeriodInfoTrader('0x80d03173a5371523f94fbba9d1fcbb0777e8dfc9')
    console.log(
        'getCurrentPeriodInfoTrader',
        formatEther(minerData.total),
        formatEther(minerData.amount),
        formatEther(minerData.pnlAmount),
        formatEther(minerData.traderAmount),
        formatEther(minerData.traderPnl),
    )


    // await clearingHouse.setRewardMiner(deployData.rewardMiner.address)
    // await rewardMiner.setClearingHouse(deployData.clearingHouse.address)

    // await rewardMiner.mint(
    //     trader1.address,
    //     parseEther('1'),
    //     parseEther('0.1'),
    // )

    // console.log(
    //     'getClaimable',
    //     formatEther(await rewardMiner.getClaimable(trader2.address))
    // )

    // let minerResp = await rewardMiner.getCurrentPeriodInfoTrader(trader2.address)
    // console.log(
    //     'getCurrentPeriodInfoTrader',
    //     formatEther(minerResp.total),
    //     formatEther(minerResp.amount),
    //     formatEther(minerResp.pnlAmount),
    //     formatEther(minerResp.traderAmount),
    //     formatEther(minerResp.traderPnl),
    // )

    // let periodResp = await rewardMiner.getCurrentPeriodInfo()
    // console.log(
    //     'getCurrentPeriodInfo',
    //     formatEther(periodResp.amount),
    //     formatEther(periodResp.pnlAmount),
    // )

    // await clearingHouse.setRewardMiner(deployData.rewardMiner.address)

    // {
    //     var baseToken = (await hre.ethers.getContractAt('BaseToken', deployData.vBAYC.address)) as BaseToken;

    //     var isBaseToQuote = true;

    //     let currPriceX96 = await exchange.getSqrtMarkTwapX96(baseToken.address, 0)
    //     let currPrice = new bn(formatSqrtPriceX96ToPrice(currPriceX96, 18))

    //     let limitTick = 100
    //     let currentPriceTick = priceToTick(currPrice.toNumber(), 60)
    //     let limitPriceTick = currentPriceTick + (isBaseToQuote ? -limitTick : limitTick)
    //     let limitPrice = new bn(1.0001).pow(limitPriceTick)

    //     let estimateSwap = await exchange.estimateSwap({
    //         baseToken: baseToken.address,
    //         isBaseToQuote: isBaseToQuote,
    //         isExactInput: !isBaseToQuote,
    //         oppositeAmountBound: 0,
    //         amount: ethers.constants.MaxUint256.div(1e10),
    //         sqrtPriceLimitX96: encodePriceSqrt(limitPrice.toString(), '1'),
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     })
    //     let limitBase: bn;
    //     let limitQuote: bn;
    //     if (isBaseToQuote) {
    //         limitBase = new bn(estimateSwap.amountIn.toString())
    //         limitQuote = new bn(estimateSwap.amountOut.toString())
    //     } else {
    //         limitBase = new bn(estimateSwap.amountOut.toString())
    //         limitQuote = new bn(estimateSwap.amountIn.toString())
    //     }
    //     console.log(
    //         'limitQuote',
    //         limitTick,
    //         currentPriceTick,
    //         limitPriceTick,
    //         currPrice.toFixed(4).toString(),
    //         limitPrice.toFixed(4).toString(),
    //         formatEther(limitBase.toString()),
    //         formatEther(limitQuote.toString()),
    //     )
    // }


    // {
    //     await waitForTx(
    //         await clearingHouse.connect(trader1).openPosition({
    //             baseToken: deployData.vDOODLE.address,
    //             isBaseToQuote: false,
    //             isExactInput: true,
    //             oppositeAmountBound: 0,
    //             amount: parseEther('200'),
    //             sqrtPriceLimitX96: encodePriceSqrt('4.4', '1'),
    //             deadline: ethers.constants.MaxUint256,
    //             referralCode: ethers.constants.HashZero,
    //         }),
    //         'clearingHouse.connect(trader).openPosition'
    //     )
    // }

    // {
    //     await waitForTx(
    //         await clearingHouse.connect(trader1).openPosition({
    //             baseToken: deployData.vDOODLE.address,
    //             isBaseToQuote: true,
    //             isExactInput: false,
    //             oppositeAmountBound: 0,
    //             amount: parseEther('200'),
    //             sqrtPriceLimitX96: encodePriceSqrt('4.35', '1'),
    //             deadline: ethers.constants.MaxUint256,
    //             referralCode: ethers.constants.HashZero,
    //         }),
    //         'clearingHouse.connect(trader).openPosition'
    //     )
    // }

    // {
    //     console.log(
    //         'isLiquidatable',
    //         await clearingHouse.isLiquidatable('0xbbe698f1459da7dd2b6962bc48bbbc8a80e2210e')
    //     )
    // }

    // console.log(
    //     (await exchange.getOverPriceSpreadInfo(deployData.vAZUKI.address))[0].toString()
    // )

    // console.log(
    //     (await exchange.getInsuranceFundFeeRatio(deployData.vBAYC.address, false)).toString()
    // )

    // console.log(
    //     'insuranceFund.getPnlAndPendingFee',
    //     formatEther((await vault.getFreeCollateral(insuranceFund.address))),
    //     formatEther(await insuranceFund.getRepegAccumulatedFund()),
    //     formatEther(await insuranceFund.getRepegDistributedFund()),
    //     'platformFund.getPnlAndPendingFee',
    //     formatEther((await vault.getFreeCollateral(platformFund.address))),
    // )

    // if ((await insuranceFund.getClearingHouse()).toLowerCase() != clearingHouse.address.toLowerCase()) {
    //     await waitForTx(
    //         await insuranceFund.setClearingHouse(clearingHouse.address), 'insuranceFund.setClearingHouse(clearingHouse.address)'
    //     )
    // }
    // return


    // let nftPriceFeeds = [
    //     deployData.nftPriceFeedBAYC,
    //     deployData.nftPriceFeedMAYC,
    //     deployData.nftPriceFeedCRYPTOPUNKS,
    //     deployData.nftPriceFeedMOONBIRD,
    //     deployData.nftPriceFeedAZUKI,
    //     deployData.nftPriceFeedCLONEX,
    //     deployData.nftPriceFeedDOODLE,
    // ];
    // for (let i = 0; i < nftPriceFeeds.length; i++) {
    //     var nftPriceFeedAddress = nftPriceFeeds[i].address
    //     var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', nftPriceFeedAddress)) as NftPriceFeed;
    //     console.log(
    //         formatEther(await priceFeed.getPrice(0))
    //     )
    // }


    // let addr = '0x1a8a3373bf1aeb5e1a21015e71541ff4be09ee41'
    // let balance = await vault.getBalanceByToken(addr, wETH.address)
    // let pnlAndFee = (await accountBalance.getPnlAndPendingFee(addr))
    // let fundingFee = (await exchange.getAllPendingFundingPayment(addr))
    // console.log(
    //     'clearingHouse.isLiquidatable',
    //     addr,
    //     formatEther(balance),
    //     formatEther(pnlAndFee[0]),
    //     formatEther(pnlAndFee[1]),
    //     formatEther(pnlAndFee[2]),
    //     formatEther(fundingFee),
    //     formatEther((await vault.getAccountValue(addr))),
    //     formatEther((await accountBalance.getMarginRequirementForLiquidation(addr))),
    //     (await clearingHouse.isLiquidatable(addr)),
    // )

    // await waitForTx(
    //     await vault.connect(hieuq).withdrawEther(parseEther('10')),
    //     'vault.connect(hieuq).withdrawEther(parseEther(10))'
    // )


    // await waitForTx(
    //     await pNFTToken.mint(rewardMiner.address, parseEther('60000000')),
    //     'pNFTToken.mint(rewardMiner.address, parseEther(60000000))'
    // )

    // console.log(
    //     'rewardMiner.getPeriodDuration',
    //     (await rewardMiner.getPeriodDuration()).toString(),
    //     (await rewardMiner.getStart()).toString(),
    // )

    // var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;
    // await waitForTx(
    //     await wETH.mint(deployData.testFaucet.address, parseEther('10000')),
    //     'wETH.mint(deployData.testFaucet.address, parseEther(10000))'
    // )


    // 0xafFABBC0bf710D1D0fdA35FAeEFBe1bB77c70EC2

    // let receipt = await hre.ethers.getDefaultProvider(network).getTransactionReceipt('0x827f23b9c3182e11505df08c6d1c269adde9b16c44ffd78419c282127bae3a85')
    // console.log(receipt)
    // return
    // let e = await findPFundingPaymentSettledEvents(clearingHouse, receipt)[0];
    // console.log(e)

    // let info = await exchange.getGlobalFundingGrowthInfo(deployData.vBAYC.address)
    // console.log(
    //     'getGlobalFundingGrowthInfo',
    //     (info[1].twLongPremiumX96).toString(),
    //     (info[1].twShortPremiumX96).toString(),
    // )

    // await clearingHouseConfig.setDurationRepegOverPriceSpread(4 * 3600);

    // let baseTokens = [
    //     deployData.vBAYC,
    //     deployData.vMAYC,
    //     deployData.vCRYPTOPUNKS,
    //     deployData.vMOONBIRD,
    //     deployData.vAZUKI,
    //     deployData.vCLONEX,
    //     deployData.vDOODLE,
    // ];
    // for (let i = 0; i < 7; i++) {
    //     let baseTokenAddr = baseTokens[i].address
    //     var isAbleRepeg = (await clearingHouse.isAbleRepeg(baseTokenAddr))
    //     console.log(
    //         'isAbleRepeg',
    //         isAbleRepeg
    //     )
    //     if (isAbleRepeg) {
    //         await waitForTx(
    //             await clearingHouse.repeg(baseTokenAddr),
    //             'clearingHouse.repeg(' + baseTokenAddr + ')'
    //         )
    //     }
    // }
    // return

    // await waitForTx(
    //     await clearingHouse.emergencyLiquidate('0x810f19553276621e2e2ec0c76a6f6aa42864f9fe', deployData.vDOODLE.address),
    //     'clearingHouse.emergencyLiquidate'
    // )


    // var baseTokenAddr = deployData.vBAYC.address
    // {
    //     await waitForTx(
    //         await clearingHouse.connect(hieuq).openPosition({
    //             baseToken: baseTokenAddr,
    //             isBaseToQuote: true,
    //             isExactInput: false,
    //             oppositeAmountBound: 0,
    //             amount: parseEther("4.5"),
    //             sqrtPriceLimitX96: 0,
    //             deadline: ethers.constants.MaxUint256,
    //             referralCode: ethers.constants.HashZero,
    //         }),
    //         'clearingHouse.connect(trader).openPosition'
    //     )
    // }

    // var baseTokenAddr = deployData.vMAYC.address
    // {
    //     await waitForTx(
    //         await clearingHouse.connect(hieuq).openPosition({
    //             baseToken: baseTokenAddr,
    //             isBaseToQuote: false,
    //             isExactInput: true,
    //             oppositeAmountBound: 0,
    //             amount: parseEther("4.5"),
    //             sqrtPriceLimitX96: 0,
    //             deadline: ethers.constants.MaxUint256,
    //             referralCode: ethers.constants.HashZero,
    //         }),
    //         'clearingHouse.connect(trader).openPosition'
    //     )
    // }

    // return IAccountBalance(_accountBalance).getMarginRequirementForLiquidation(trader)

    // let markTwapX96 = await exchange.getSqrtMarkTwapX96(baseTokenAddr, 0)
    // let markTwap = new bn(formatSqrtPriceX96ToPrice(markTwapX96, 18))
    // console.log(
    //     'markTwap',
    //     markTwap.toString()
    // )


    // var address = '0x088d8a4a03266870edcbbbadda3f475f404db9b2'
    // // let v = await accountBalance.getMarginRequirementForLiquidation(address)
    // // console.log(
    // //     'getMarginRequirementForLiquidation',
    // //     formatEther(v),
    // // )
    // console.log(
    //     'getTotalAbsPositionValue',
    //     formatEther(await accountBalance.getTotalAbsPositionValue(address)),
    // )


    // let [realizedPnl, unrealizedPnl] = await accountBalance.getPnlAndPendingFee(address)
    // let freeCollateral = (await vault.getFreeCollateral(address))
    // let balance = (await vault.getBalance(address))
    // console.log(
    //     'isLiquidatable',
    //     address,
    //     formatEther(balance),
    //     formatEther(realizedPnl),
    //     formatEther(freeCollateral),
    //     formatEther(new bn(freeCollateral.toString()).minus(new bn(formatEther(realizedPnl)).toFixed(0)).toString()),
    // )

    // var isAbleRepeg = (await clearingHouse.isAbleRepeg(baseTokenAddr))
    // console.log(
    //     'isAbleRepeg',
    //     isAbleRepeg
    // )
    // if (isAbleRepeg) {
    //     waitForTx(
    //         await clearingHouse.repeg(baseTokenAddr),
    //         'clearingHouse.repeg(' + baseTokenAddr + ')'
    //     )
    // }

    // console.log(
    //     await testFaucet.isFaucet('0xFC3d83536a44f13F6266C8607C5B62E62C058c0e')
    // )
    // return


    // var address = '0x088d8a4a03266870edcbbbadda3f475f404db9b2'
    // let [realizedPnl, unrealizedPnl] = await accountBalance.getPnlAndPendingFee(address)
    // console.log(
    //     'isLiquidatable',
    //     address,
    //     formatEther(realizedPnl),
    //     formatEther(unrealizedPnl),
    //     formatEther(await vault.getAccountValue(address)),
    //     formatEther(await accountBalance.getMarginRequirementForLiquidation(address)),
    //     formatEther(await accountBalance.getTotalPositionSize(address, deployData.vBAYC.address)),
    //     formatEther(await accountBalance.getTotalPositionValue(address, deployData.vBAYC.address)),
    // )

    // {
    //     var vBAYC = (await hre.ethers.getContractAt('BaseToken', deployData.vBAYC.address)) as BaseToken;
    //     let currPriceX96 = await exchange.getSqrtMarkTwapX96(vBAYC.address, 0)
    //     let currPrice = new bn(formatSqrtPriceX96ToPrice(currPriceX96, 18))
    //     var isBaseToQuote = true;
    //     let estimateSwap = await exchange.estimateSwap({
    //         baseToken: vBAYC.address,
    //         isBaseToQuote: isBaseToQuote,
    //         isExactInput: !isBaseToQuote,
    //         oppositeAmountBound: 0,
    //         amount: parseEther("10"),
    //         sqrtPriceLimitX96: parseEther("0"),
    //         deadline: ethers.constants.MaxUint256,
    //         referralCode: ethers.constants.HashZero,
    //     })
    //     let newPrice: bn;
    //     if (isBaseToQuote) {
    //         newPrice = new bn(estimateSwap.amountOut.toString()).div(new bn(estimateSwap.amountIn.toString()))
    //     } else {
    //         newPrice = new bn(estimateSwap.amountIn.toString()).div(new bn(estimateSwap.amountOut.toString()))
    //     }
    //     console.log(
    //         'newPrice',
    //         currPrice.toString(),
    //         newPrice.toString(),
    //     )
    // }

    // // check start
    // {
    //     let startTime = rewardMiner.getStart()
    // }
    // // get current period info
    // {
    //     const [
    //         periodNumber,
    //         start,
    //         end,
    //         total,
    //         amount,
    //     ] = await rewardMiner.getCurrentPeriodInfo();
    //     console.log(
    //         'getCurrentPeriodInfo',
    //         (periodNumber).toString(),
    //         (start).toString(),
    //         (end).toString(),
    //         formatEther(total),
    //         formatEther(amount),
    //     )
    // }
    // // get current period info and trader amount
    // {
    //     const [
    //         periodNumber,
    //         start,
    //         end,
    //         total,
    //         amount,
    //         traderAmount,
    //     ] = await rewardMiner.getCurrentPeriodInfoTrader('0x088D8A4a03266870EDcbbbADdA3F475f404dB9B2');
    //     console.log(
    //         'getCurrentPeriodInfoTrader',
    //         (periodNumber).toString(),
    //         (start).toString(),
    //         (end).toString(),
    //         formatEther(total),
    //         formatEther(amount),
    //         formatEther(traderAmount),
    //     )
    // }

    // console.log(
    //     'getClaimable 0x4e623cde68aefe0a92907ee7eef03d96f76ef584',
    //     formatEther(await rewardMiner.getClaimable('0x4e623cde68aefe0a92907ee7eef03d96f76ef584'))
    // )

    // if ((await clearingHouse.getRewardMiner()).toLowerCase() != rewardMiner.address.toLowerCase()) {
    //     await waitForTx(
    //         await clearingHouse.setRewardMiner(rewardMiner.address), 'clearingHouse.setRewardMiner(rewardMiner.address)'
    //     )
    // }

    // await waitForTx(
    //     await rewardMiner.startMiner('1675826100'), 'rewardMiner.startMiner()'
    // )

    // await pNFTToken.mint(rewardMiner.address, parseEther('9000000'));

    // let baseTokens = [
    //     deployData.vBAYC,
    //     deployData.vMAYC,
    //     deployData.vCRYPTOPUNKS,
    //     deployData.vMOONBIRD,
    //     deployData.vAZUKI,
    //     deployData.vCLONEX,
    //     deployData.vDOODLE,
    // ];
    // let priceKeys = [
    //     'priceBAYC',
    //     'priceMAYC',
    //     'priceCRYPTOPUNKS',
    //     'priceMOONBIRD',
    //     'priceAZUKI',
    //     'priceCLONEX',
    //     'priceDOODLE'
    // ];
    // for (let i = 0; i < 7; i++) {
    //     var baseTokenAddress = baseTokens[i].address
    //     console.log(
    //         '--------------------------------------',
    //         baseTokenAddress,
    //         '--------------------------------------',
    //     )
    //     const baseToken = (await ethers.getContractAt('BaseToken', baseTokenAddress)) as BaseToken;
    //     {
    //         // var maxTickCrossedWithinBlock: number = 200
    //         var maxTickCrossedWithinBlock: number = 1774544
    //         if ((await exchange.getMaxTickCrossedWithinBlock(baseToken.address)).toString() != maxTickCrossedWithinBlock.toString()) {
    //             await tryWaitForTx(
    //                 await exchange.setMaxTickCrossedWithinBlock(baseToken.address, maxTickCrossedWithinBlock), 'exchange.setMaxTickCrossedWithinBlock(baseToken.address, maxTickCrossedWithinBlock)'
    //             )
    //         }
    //         // {
    //         //     if ((await marketRegistry.getInsuranceFundFeeRatio(baseToken.address)).toString() != '1000') {
    //         //         await waitForTx(
    //         //             await marketRegistry.setInsuranceFundFeeRatio(baseToken.address, '1000'), 'marketRegistry.setInsuranceFundFeeRatio(baseToken.address, 1000)'
    //         //         )
    //         //     }
    //         //     if ((await marketRegistry.getPlatformFundFeeRatio(baseToken.address)).toString() != '1500') {
    //         //         await waitForTx(
    //         //             await marketRegistry.setPlatformFundFeeRatio(baseToken.address, '1500'), 'marketRegistry.setInsuranceFundFeeRatio(baseToken.address, 1500)'
    //         //         )
    //         //     }
    //         // }
    //     }
    // }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});