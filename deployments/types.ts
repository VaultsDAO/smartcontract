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
    priceFeedETH: PriceFeedData,
    priceFeedBTC: PriceFeedData,
    wETH: TokenData,
    wBTC: TokenData,
    USDC: TokenData,
    quoteToken: TokenData,
    baseToken: ContractData,
    vETH: TokenData,
    vBTC: TokenData,
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
    clearingHouse: ContractData,
}