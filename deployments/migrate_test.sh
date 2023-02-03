npx hardhat run deployments/migrate_1Contracts.ts --network arbitrumTest --no-compile
npx hardhat run deployments/migrate_2Init_Config.ts --network arbitrumTest --no-compile
npx hardhat run deployments/migrate_3GetPrices.ts --network mainnet --no-compile
npx hardhat run deployments/migrate_4SetPrices.ts --network arbitrumTest --no-compile
npx hardhat run deployments/migrate_5InitVToken.ts --network arbitrumTest --no-compile
npx hardhat run deployments/migrate_6AddLiquidity.ts --network arbitrumTest --no-compile
# npx hardhat run deployments/migrate_8Faucet.ts --network arbitrumTest --no-compile