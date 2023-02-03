# npm run build

npx hardhat run deployments/0_migrate_Deploy.ts --network local --no-compile

npx hardhat run deployments/1_migrate_Admin.ts --network local --no-compile

# npx hardhat run deployments/2_migrate_PriceFeed_1BAYC.ts --network local --no-compile
# npx hardhat run deployments/2_migrate_PriceFeed_2MAYC.ts --network local --no-compile
# npx hardhat run deployments/2_migrate_PriceFeed_3CRYPTOPUNKS.ts --network local --no-compile
# npx hardhat run deployments/2_migrate_PriceFeed_4MOONBIRD.ts --network local --no-compile
# npx hardhat run deployments/2_migrate_PriceFeed_5AZUKI.ts --network local --no-compile
# npx hardhat run deployments/2_migrate_PriceFeed_6CLONEX.ts --network local --no-compile
# npx hardhat run deployments/2_migrate_PriceFeed_7DOODLE.ts --network local --no-compile

npx hardhat run deployments/2_migrate_PriceFeed_ALL.ts --network local --no-compile
npx hardhat run deployments/2_migrate_PriceFeed_11BTC.ts --network local --no-compile
npx hardhat run deployments/3_migrate_Tokens.ts --network local --no-compile
npx hardhat run deployments/4_migrate_QuoteToken.ts --network local --no-compile
npx hardhat run deployments/5_migrate_BaseToken_0.ts --network local --no-compile

# npx hardhat run deployments/5_migrate_BaseToken_1BAYC.ts --network local --no-compile
# npx hardhat run deployments/5_migrate_BaseToken_2MAYC.ts --network local --no-compile
# npx hardhat run deployments/5_migrate_BaseToken_3CRYPTOPUNKS.ts --network local --no-compile
# npx hardhat run deployments/5_migrate_BaseToken_4MOONBIRD.ts --network local --no-compile
# npx hardhat run deployments/5_migrate_BaseToken_5AZUKI.ts --network local --no-compile
# npx hardhat run deployments/5_migrate_BaseToken_6CLONEX.ts --network local --no-compile
# npx hardhat run deployments/5_migrate_BaseToken_7DOODLE.ts --network local --no-compile
npx hardhat run deployments/5_migrate_BaseToken_All.ts --network local --no-compile

npx hardhat run deployments/6_migrate_Library.ts --network local --no-compile
npx hardhat run deployments/6_migrate_UniswapV3.ts --network local --no-compile
npx hardhat run deployments/7_migrate_ClearingHouseConfig.ts --network local --no-compile
npx hardhat run deployments/8_migrate_MarketRegistry.ts --network local --no-compile
npx hardhat run deployments/9_migrate_OrderBook.ts --network local --no-compile
npx hardhat run deployments/10_migrate_AccountBalance.ts --network local --no-compile
npx hardhat run deployments/11_migrate_Exchange.ts --network local --no-compile
npx hardhat run deployments/12_migrate_InsuranceFund.ts --network local --no-compile
npx hardhat run deployments/13_migrate_Vault.ts --network local --no-compile
npx hardhat run deployments/14_migrate_CollateralManager.ts --network local --no-compile
npx hardhat run deployments/15_migrate_ClearingHouse.ts --network local --no-compile
npx hardhat run deployments/16_migrate_Init_Config.ts --network local --no-compile

# npx hardhat run deployments/16_migrate_Init_Token_1BAYC.ts --network local --no-compile
# npx hardhat run deployments/16_migrate_Init_Token_2MAYC.ts --network local --no-compile
# npx hardhat run deployments/16_migrate_Init_Token_3CRYPTOPUNKS.ts --network local --no-compile
# npx hardhat run deployments/16_migrate_Init_Token_4MOONBIRD.ts --network local --no-compile
# npx hardhat run deployments/16_migrate_Init_Token_5AZUKI.ts --network local --no-compile
# npx hardhat run deployments/16_migrate_Init_Token_6CLONEX.ts --network local --no-compile
# npx hardhat run deployments/16_migrate_Init_Token_7DOODLE.ts --network local --no-compile

npx hardhat run deployments/17_migrate_AddLiquidity_All.ts --network local --no-compile

# npx hardhat run deployments/17_migrate_AddLiquidity_1BAYC.ts --network local --no-compile
# npx hardhat run deployments/17_migrate_AddLiquidity_2MAYC.ts --network local --no-compile
# npx hardhat run deployments/17_migrate_AddLiquidity_3CRYPTOPUNKS.ts --network local --no-compile
# npx hardhat run deployments/17_migrate_AddLiquidity_4MOONBIRD.ts --network local --no-compile
# npx hardhat run deployments/17_migrate_AddLiquidity_5AZUKI.ts --network local --no-compile
# npx hardhat run deployments/17_migrate_AddLiquidity_6CLONEX.ts --network local --no-compile
# npx hardhat run deployments/17_migrate_AddLiquidity_7DOODLE.ts --network local --no-compile

npx hardhat run deployments/17_migrate_AddLiquidity_All.ts --network local --no-compile

npx hardhat run deployments/18_migrate_SetPrice_1BAYC.ts --network local --no-compile
npx hardhat run deployments/18_migrate_SetPrice_2MAYC.ts --network local --no-compile
npx hardhat run deployments/18_migrate_SetPrice_3CRYPTOPUNKS.ts --network local --no-compile
npx hardhat run deployments/18_migrate_SetPrice_4MOONBIRD.ts --network local --no-compile
npx hardhat run deployments/18_migrate_SetPrice_5AZUKI.ts --network local --no-compile
npx hardhat run deployments/18_migrate_SetPrice_6CLONEX.ts --network local --no-compile
npx hardhat run deployments/18_migrate_SetPrice_7DOODLE.ts --network local --no-compile


# npx hardhat run deployments/19_migrate_Console.ts --network local --no-compile
# npx hardhat run deployments/20_migrate_Test.ts --network local --no-compile
# npx hardhat run deployments/22_migrate_Faucet.ts --network local --no-compile


