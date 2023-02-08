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
    //tokenomics
    coreAddress: string,
    treasuryAddress: string,
    rewardAddress: string,
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
    nftPriceFeedCRYPTOPUNKS: TokenData,
    nftPriceFeedMOONBIRD: TokenData,
    nftPriceFeedAZUKI: TokenData,
    nftPriceFeedCLONEX: TokenData,
    nftPriceFeedDOODLE: TokenData,
    baseToken: ContractData,
    vBAYC: TokenData,
    vMAYC: TokenData,
    vCRYPTOPUNKS: TokenData,
    vMOONBIRD: TokenData,
    vAZUKI: TokenData,
    vCLONEX: TokenData,
    vDOODLE: TokenData,
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
    pNFTToken: TokenData,
    rewardMiner: ContractData,
    testFaucet: ContractData,
    testCheck: {
        addLiquidity: boolean,
        deposit: boolean,
        openPosition: boolean,
        closePosition: boolean,
        removeLiquidity: boolean,
    }
}

type PriceData = {
    priceBAYC: string,
    priceMAYC: string,
    priceCRYPTOPUNKS: string,
    priceMOONBIRD: string,
    priceAZUKI: string,
    priceCLONEX: string,
    priceDOODLE: string
}