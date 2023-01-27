type PriceFeedData = {
    address: string,
    aggregatorAddress: string,
}

type TokenData = {
    address: string,
    symbol: string,
    name: string,
    decimals: number,
    implAddress: string,
    aggregatorAddress: string,
    priceFeedAddress: string,
    poolAddress: string,
}

type ContractData = {
    address: string,
    implAddress: string
}

type DeployData = {
    verifiedContracts: any,
    platformFundAddress: string,
    makerFundAddress: string,
    wETH: TokenData,
    vETH: TokenData,
    nftPriceFeedBAYC: TokenData,
    nftPriceFeedMAYC: TokenData,
    baseToken: ContractData,
    vBAYC: TokenData,
    vMAYC: TokenData,
    proxyAdminAddress: string,
    uniswapV3Factory: ContractData,
    clearingHouseConfig: ContractData,
    marketRegistry: ContractData,
    orderBook: ContractData,
    accountBalance: ContractData,
    exchange: ContractData,
    insuranceFund: ContractData,
    vault: ContractData,
    collateralManager: ContractData,
    genericLogic: ContractData,
    liquidityLogic: ContractData,
    exchangeLogic: ContractData,
    clearingHouse: ContractData,
    testFaucet: ContractData,
    testCheck: {
        addLiquidity: boolean,
        deposit: boolean,
        openPosition: boolean,
        closePosition: boolean,
        removeLiquidity: boolean,
    }
}