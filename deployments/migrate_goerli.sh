# 
# 
# 

npx hardhat run deployments/migrate_1Contracts.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/migrate_2Init_Config.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/migrate_3GetPrices.ts --network mainnet --no-compile
npx hardhat run deployments/migrate_4SetPrices.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/migrate_5InitVToken.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/migrate_6AddLiquidity.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/migrate_8Trade.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/migrate_9StartMiner.ts --network arbitrumGoerli --no-compile
npx hardhat run deployments/migrate_Repeg.ts --network arbitrumGoerli --no-compile