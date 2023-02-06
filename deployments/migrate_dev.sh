# 
# 
# 
npx hardhat run deployments/migrate_1Contracts.ts --network arbitrumDev --no-compile
npx hardhat run deployments/migrate_2Init_Config.ts --network arbitrumDev --no-compile
npx hardhat run deployments/migrate_3GetPrices.ts --network mainnet --no-compile
npx hardhat run deployments/migrate_4SetPrices.ts --network arbitrumDev --no-compile
npx hardhat run deployments/migrate_5InitVToken.ts --network arbitrumDev --no-compile
npx hardhat run deployments/migrate_6AddLiquidity.ts --network arbitrumDev --no-compile
npx hardhat run deployments/migrate_7Faucet.ts --network arbitrumDev --no-compile
npx hardhat run deployments/migrate_8Trade.ts --network arbitrumDev --no-compile