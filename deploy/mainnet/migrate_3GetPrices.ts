import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, INFTOracleGetter, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, UniswapV3Pool } from "../../typechain";
import { getMaxTickRange } from "../../test/helper/number";
import helpers from "./helpers";
import { parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    let fileName = process.cwd() + '/deploy/mainnet/address/prices.json';
    let priceData: PriceData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    priceData = JSON.parse(dataText.toString())
    // 
    var nftOracle = (await hre.ethers.getContractAt('INFTOracleGetter', '0x7C2A19e54e48718f6C60908a9Cff3396E4Ea1eBA')) as INFTOracleGetter;
    // 
    let nftAddrs = [
        '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
        '0x60E4d786628Fea6478F785A6d7e704777c86a7c6',
        '0xb7F7F6C52F2e2fdb1963Eab30438024864c313F6',
        '0x23581767a106ae21c074b2276D25e5C3e136a68b',
        '0xED5AF388653567Af2F388E6224dC7C4b3241C544',
        '0x49cF6f5d44E70224e2E23fDcdd2C053F30aDA28B',
        '0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e',
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
    for (let i = 0; i < nftAddrs.length; i++) {
        let price = await nftOracle.getAssetPrice(nftAddrs[i])
        priceData[priceKeys[i]] = price.toString()
        await fs.writeFileSync(fileName, JSON.stringify(priceData, null, 4))
        console.log(
            priceKeys[i],
            nftAddrs[i],
            price.toString()
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});