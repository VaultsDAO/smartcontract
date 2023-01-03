type CollteralData = {
    address: string,
    symbol: string,
    name: string,
    decimals: number,
}

type BaseTokenData = {
    address: string,
    symbol: string,
    name: string,
    aggregatorAddress: string,
    priceFeedAddress: string,
    poolAddress: string,
}

type QuoteTokenData = {
    address: string,
    implAddress: string,
    symbol: string,
    name: string,
}

type ContractData = {
    address: string,
    implAddress: string
}

type DeployData = {
    verifiedContracts: any,
    baseToken: ContractData,
    baseTokens: Array<BaseTokenData>,
    quoteToken: QuoteTokenData,
    proxyAdminAddress: string,
    uniswapV3Factory: ContractData,
}