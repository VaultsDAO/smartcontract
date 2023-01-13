import { MockContract, smockit } from "@eth-optimism/smock"
import { ethers } from "hardhat"
import { BaseToken, QuoteToken, UniswapV3Factory, UniswapV3Pool, VirtualToken } from "../../typechain"
import { ChainlinkPriceFeedV2, EmergencyPriceFeed } from "../../typechain"
import { NftPriceFeed } from "../../typechain"
import { isAscendingTokenOrder } from "./utilities"

interface TokensFixture {
    token0: BaseToken
    token1: QuoteToken
    mockedNFTPriceFeed0: MockContract
    mockedNFTPriceFeed1: MockContract
}

interface PoolFixture {
    factory: UniswapV3Factory
    pool: UniswapV3Pool
    baseToken: BaseToken
    quoteToken: QuoteToken
}

interface BaseTokenFixture {
    baseToken: BaseToken
    mockedNFTPriceFeed: MockContract
}

export function createQuoteTokenFixture(name: string, symbol: string): () => Promise<QuoteToken> {
    return async (): Promise<QuoteToken> => {
        const quoteTokenFactory = await ethers.getContractFactory("QuoteToken")
        const quoteToken = (await quoteTokenFactory.deploy()) as QuoteToken
        await quoteToken.initialize(name, symbol)
        return quoteToken
    }
}

// export function createBaseTokenFixture(name: string, symbol: string): () => Promise<BaseTokenFixture> {
//     return async (): Promise<BaseTokenFixture> => {
//         const aggregatorFactory = await ethers.getContractFactory("TestAggregatorV3")
//         const aggregator = await aggregatorFactory.deploy()
//         const mockedAggregator = await smockit(aggregator)

//         mockedAggregator.smocked.decimals.will.return.with(async () => {
//             return 6
//         })

//         const chainlinkPriceFeedFactory = await ethers.getContractFactory("ChainlinkPriceFeedV2")
//         const cacheTwapInterval = 15 * 60
//         const chainlinkPriceFeed = (await chainlinkPriceFeedFactory.deploy(
//             mockedAggregator.address,
//             cacheTwapInterval,
//         )) as ChainlinkPriceFeedV2

//         const baseTokenFactory = await ethers.getContractFactory("BaseToken")
//         const baseToken = (await baseTokenFactory.deploy()) as BaseToken
//         await baseToken.initialize(name, symbol, chainlinkPriceFeed.address)

//         return { baseToken, mockedAggregator }
//     }
// }

export function createBaseTokenFixture(name: string, symbol: string, priceAdmin: string): () => Promise<BaseTokenFixture> {
    return async (): Promise<BaseTokenFixture> => {
        const NftPriceFeed = await ethers.getContractFactory("NftPriceFeed")
        const nftPriceFeed = (await NftPriceFeed.deploy(
            'XXX_ZZZ',
            priceAdmin,
        )) as NftPriceFeed
        const mockedNFTPriceFeed = await smockit(nftPriceFeed)

        mockedNFTPriceFeed.smocked.decimals.will.return.with(async () => {
            return 18
        })

        const baseTokenFactory = await ethers.getContractFactory("BaseToken")
        const baseToken = (await baseTokenFactory.deploy()) as BaseToken
        await baseToken.initialize(name, symbol, mockedNFTPriceFeed.address)

        return { baseToken, mockedNFTPriceFeed }
    }
}

export async function uniswapV3FactoryFixture(): Promise<UniswapV3Factory> {
    const factoryFactory = await ethers.getContractFactory("UniswapV3Factory")
    return (await factoryFactory.deploy()) as UniswapV3Factory
}

// assume isAscendingTokensOrder() == true/ token0 < token1
export async function tokensFixture(priceAdmin: string): Promise<TokensFixture> {
    const { baseToken: randomToken0, mockedNFTPriceFeed: randomMockedNFTPriceFeed0 } = await createBaseTokenFixture(
        "BAYC",
        "USD",
        priceAdmin,
    )()
    const { baseToken: randomToken1, mockedNFTPriceFeed: randomMockedNFTPriceFeed1 } = await createBaseTokenFixture(
        "MAYC",
        "USD",
        priceAdmin,
    )()

    let token0: BaseToken
    let token1: QuoteToken
    let mockedNFTPriceFeed0: MockContract
    let mockedNFTPriceFeed1: MockContract
    if (isAscendingTokenOrder(randomToken0.address, randomToken1.address)) {
        token0 = randomToken0
        mockedNFTPriceFeed0 = randomMockedNFTPriceFeed0
        token1 = randomToken1 as VirtualToken as QuoteToken
        mockedNFTPriceFeed1 = randomMockedNFTPriceFeed1
    } else {
        token0 = randomToken1
        mockedNFTPriceFeed0 = randomMockedNFTPriceFeed1
        token1 = randomToken0 as VirtualToken as QuoteToken
        mockedNFTPriceFeed1 = randomMockedNFTPriceFeed0
    }
    return {
        token0,
        mockedNFTPriceFeed0,
        token1,
        mockedNFTPriceFeed1,
    }
}

export async function token0Fixture(token1Addr: string, priceAdmin:string): Promise<BaseTokenFixture> {
    let token0Fixture: BaseTokenFixture
    while (!token0Fixture || !isAscendingTokenOrder(token0Fixture.baseToken.address, token1Addr)) {
        token0Fixture = await createBaseTokenFixture("RandomTestToken0", "randomToken0", priceAdmin)()
    }
    return token0Fixture
}

export async function base0Quote1PoolFixture(priceAdmin:string): Promise<PoolFixture> {
    const { token0, token1 } = await tokensFixture(priceAdmin)
    const factory = await uniswapV3FactoryFixture()

    const tx = await factory.createPool(token0.address, token1.address, "10000")
    const receipt = await tx.wait()
    const poolAddress = receipt.events?.[0].args?.pool as string

    const poolFactory = await ethers.getContractFactory("UniswapV3Pool")
    const pool = poolFactory.attach(poolAddress) as UniswapV3Pool

    return { factory, pool, baseToken: token0, quoteToken: token1 }
}

export async function emergencyPriceFeedFixture(poolAddr: string, baseToken: BaseToken): Promise<EmergencyPriceFeed> {
    const emergencyPriceFeedFactory = await ethers.getContractFactory("EmergencyPriceFeed")
    const emergencyPriceFeed = (await emergencyPriceFeedFactory.deploy(poolAddr)) as EmergencyPriceFeed
    await baseToken.setPriceFeed(emergencyPriceFeed.address)
    return emergencyPriceFeed
}
