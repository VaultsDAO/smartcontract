import fs from "fs";

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

async function main() {
    await deploy();
}

export default deploy;

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function deploy() {
    {
        console.log('migrateAdmin -- START --')
        await migrateAdmin();
        console.log('migrateAdmin -- END --')
    }
    await delay(0)
    {
        console.log('migratePriceFeedAll -- START --')
        await migratePriceFeedAll();
        console.log('migratePriceFeedAll -- END --')
    }
    await delay(0)
    // import migrateTokens from "./3_migrate_Tokens";
    {
        console.log('migrateTokens -- START --')
        await migrateTokens();
        console.log('migrateTokens -- END --')
    }
    await delay(0)
    // import migrateQuoteToken from "./4_migrate_QuoteToken";
    {
        console.log('migrateQuoteToken -- START --')
        await migrateQuoteToken();
        console.log('migrateQuoteToken -- END --')
    }
    await delay(0)
    // import migrateBaseTokenAll from "./5_migrate_BaseToken_All";
    {
        console.log('migrateBaseTokenAll -- START --')
        await migrateBaseTokenAll();
        console.log('migrateBaseTokenAll -- END --')
    }
    await delay(0)
    // import migrateLibrary from "./6_migrate_Library";
    {
        console.log('migrateLibrary -- START --')
        await migrateLibrary();
        console.log('migrateLibrary -- END --')
    }
    await delay(0)
    // import migrateUniswapV3 from "./6_migrate_UniswapV3";
    {
        console.log('migrateUniswapV3 -- START --')
        await migrateUniswapV3();
        console.log('migrateUniswapV3 -- END --')
    }
    await delay(0)
    // import migrateClearingHouseConfig from "./7_migrate_ClearingHouseConfig";
    {
        console.log('migrateClearingHouseConfig -- START --')
        await migrateClearingHouseConfig();
        console.log('migrateClearingHouseConfig -- END --')
    }
    await delay(0)
    // import migrateMarketRegistry from "./8_migrate_MarketRegistry";
    {
        console.log('migrateMarketRegistry -- START --')
        await migrateMarketRegistry();
        console.log('migrateMarketRegistry -- END --')
    }
    await delay(0)
    // import migrateOrderBook from "./9_migrate_OrderBook";
    {
        console.log('migrateOrderBook -- START --')
        await migrateOrderBook();
        console.log('migrateOrderBook -- END --')
    }
    await delay(0)
    // import migrateAccountBalance from "./10_migrate_AccountBalance";
    {
        console.log('migrateAccountBalance -- START --')
        await migrateAccountBalance();
        console.log('migrateAccountBalance -- END --')
    }
    await delay(0)
    // import migrateExchange from "./11_migrate_Exchange";
    {
        console.log('migrateExchange -- START --')
        await migrateExchange();
        console.log('migrateExchange -- END --')
    }
    await delay(0)
    // import migrateInsuranceFund from "./12_migrate_InsuranceFund";
    {
        console.log('migrateInsuranceFund -- START --')
        await migrateInsuranceFund();
        console.log('migrateInsuranceFund -- END --')
    }
    await delay(0)
    // import migrateVault from "./13_migrate_Vault";
    {
        console.log('migrateVault -- START --')
        await migrateVault();
        console.log('migrateVault -- END --')
    }
    await delay(0)
    // import migrateCollateralManager from "./14_migrate_CollateralManager";
    {
        console.log('migrateCollateralManager -- START --')
        await migrateCollateralManager();
        console.log('migrateCollateralManager -- END --')
    }
    await delay(0)
    // import migrateClearingHouse from "./15_migrate_ClearingHouse";
    {
        console.log('migrateClearingHouse -- START --')
        await migrateClearingHouse();
        console.log('migrateClearingHouse -- END --')
    }
    await delay(0)
    // import migratePNFTToken from "./20_migrate_PNFTToken";
    {
        console.log('migratePNFTToken -- START --')
        await migratePNFTToken();
        console.log('migratePNFTToken -- END --')
    }
    await delay(0)
    // import migrateRewardMiner from "./21_migrate_RewardMiner";
    {
        console.log('migrateRewardMiner -- START --')
        await migrateRewardMiner();
        console.log('migrateRewardMiner -- END --')
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});