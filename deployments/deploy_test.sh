# npm run build
npx hardhat run deployments/1_migrate_Admin.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/2_migrate_PriceFeed.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/3_migrate_Tokens.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/4_migrate_QuoteToken.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/5_migrate_BaseTokens.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/6_migrate_UniswapV3.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/7_migrate_ClearingHouseConfig.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/8_migrate_MarketRegistry.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/9_migrate_OrderBook.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/10_migrate_AccountBalance.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/11_migrate_Exchange.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/12_migrate_InsuranceFund.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/13_migrate_Vault.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/14_migrate_CollateralManager.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/15_migrate_ClearingHouse.ts --network arbitrumGoerli --no-compile
# npx hardhat run deployments/16_migrate_Init.ts --network arbitrumGoerli --no-compile
# npx hardhat run deployments/17_migrate_AddLiquidity.ts --network arbitrumGoerli --no-compile
# npx hardhat run deployments/18_migrate_Console.ts --network arbitrumGoerli --no-compile
# npx hardhat run deployments/20_migrate_Test.ts --network arbitrumGoerli --no-compile