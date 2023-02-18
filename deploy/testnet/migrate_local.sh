npx hardhat run deploy/testnet/migrate_1Contracts.ts --network local --no-compile
npx hardhat run deploy/testnet/migrate_2Init_Config.ts --network local --no-compile
npx hardhat run deploy/testnet/migrate_3GetPrices.ts --network mainnet --no-compile
npx hardhat run deploy/testnet/migrate_4SetPrices.ts --network local --no-compile
npx hardhat run deploy/testnet/migrate_5InitVToken.ts --network local --no-compile
npx hardhat run deploy/testnet/migrate_6AddLiquidity.ts --network local --no-compile
# npx hardhat run deploy/testnet/migrate_8Faucet.ts --network local --no-compile