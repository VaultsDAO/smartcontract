npx hardhat run deployments/migrate_1Contracts.ts --network local --no-compile
npx hardhat run deployments/migrate_2Init_Config.ts --network local --no-compile
npx hardhat run deployments/migrate_3GetPrices.ts --network mainnet --no-compile
npx hardhat run deployments/migrate_4SetPrices.ts --network local --no-compile
npx hardhat run deployments/migrate_5InitVToken.ts --network local --no-compile
npx hardhat run deployments/migrate_6AddLiquidity.ts --network local --no-compile
# npx hardhat run deployments/migrate_8Faucet.ts --network local --no-compile