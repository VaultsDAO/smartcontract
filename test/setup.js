const MockReserve = artifacts.require("MockReserve");
const MockWETH = artifacts.require("MockWETH");
const MockNFT = artifacts.require("MockNFT");
const MockNFTOracle = artifacts.require("MockNFTOracle");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const MultipleUpgradeableProxy = artifacts.require('MultipleUpgradeableProxy');
const ConfigProvider = artifacts.require("ConfigProvider");
const ShopFactory = artifacts.require("ShopFactory");
const MockChainlinkOracle = artifacts.require("MockChainlinkOracle");
const ReserveOracle = artifacts.require("ReserveOracle");
const PawnNFTOracle = artifacts.require("PawnNFTOracle");
const BNFTRegistry = artifacts.require("BNFTRegistry");
const BNFT = artifacts.require("BNFT");
const AirdropFlashLoanReceiver = artifacts.require("AirdropFlashLoanReceiver");
const UserFlashclaimRegistry = artifacts.require("UserFlashclaimRegistry");
const ShopLoan = artifacts.require("ShopLoan");
const WETHGateway = artifacts.require("WETHGateway");

const BorrowLogic = artifacts.require("BorrowLogic");
const GenericLogic = artifacts.require("GenericLogic");
const LiquidateLogic = artifacts.require("LiquidateLogic");
const ValidationLogic = artifacts.require("ValidationLogic");

module.exports = async function (accounts) {
    const [pawnProxyAdminOwner, priceFeedAdmin, platformFeeReceiver, lender, borrower, bidder1, bidder2] = accounts;
    let weth = await MockWETH.new();
    let usdc = await MockReserve.new('USDC', 'USDC', '6');

    let testNft = await MockNFT.new('XXX', 'XXX', '');

    //  ---------------------------------------------------------------
    let pawnProxyAdmin = await PawnProxyAdmin.new({ from: pawnProxyAdminOwner });

    //   ---------------------------------------------------------------
    let provider = await ConfigProvider.new();

    let initializeData = provider.contract.methods.initialize().encodeABI();
    let proxy = await TransparentUpgradeableProxy.new(
        provider.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );

    provider = await ConfigProvider.at(proxy.address)


    // new shop factory ---------------------------------------------------------------

    const genericLogic = await GenericLogic.new();

    await ValidationLogic.link("GenericLogic", genericLogic.address);
    const validationLogic = await ValidationLogic.new();

    await LiquidateLogic.link("GenericLogic", genericLogic.address);
    await LiquidateLogic.link("ValidationLogic", validationLogic.address);
    const liquidateLogic = await LiquidateLogic.new();

    await BorrowLogic.link("GenericLogic", genericLogic.address);
    await BorrowLogic.link("ValidationLogic", validationLogic.address);
    const borrowLogic = await BorrowLogic.new();

    await ShopLoan.link("GenericLogic", genericLogic.address);

    await ShopFactory.link("GenericLogic", genericLogic.address);
    await ShopFactory.link("BorrowLogic", borrowLogic.address);
    await ShopFactory.link("LiquidateLogic", liquidateLogic.address);

    let shopFactory = await ShopFactory.new();

    initializeData = shopFactory.contract.methods.initialize(provider.address).encodeABI();
    proxy = await TransparentUpgradeableProxy.new(
        shopFactory.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );

    shopFactory = await ShopFactory.at(proxy.address)

    // Shoploan  ---------------------------------------------------------------
    let shopLoan = await ShopLoan.new();

    initializeData = shopLoan.contract.methods.initialize(provider.address).encodeABI();
    proxy = await TransparentUpgradeableProxy.new(
        shopLoan.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );

    shopLoan = await ShopLoan.at(proxy.address)

    // BNFT ---------------------------------------------------------------

    let bnft = await BNFT.new();
    let proxyKey = Buffer.from('BNFT');
    let bnftMultipleUpgradeableProxy = await MultipleUpgradeableProxy.new(pawnProxyAdmin.address, proxyKey)
    let bnftRegistry = await BNFTRegistry.new();
    initializeData = bnftRegistry.contract.methods.initialize(
        pawnProxyAdmin.address,
        'BNFT',
        'B',
    ).encodeABI();
    proxy = await TransparentUpgradeableProxy.new(
        bnftRegistry.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );
    bnftRegistry = await BNFTRegistry.at(proxy.address)

    // flash loan ---------------------------------------------------------------
    let receiverKey = Buffer.from('AIR_DROP_FLASH_LOAN_RECEIVER');
    let receiverMultipleUpgradeableProxy = await MultipleUpgradeableProxy.new(pawnProxyAdmin.address, receiverKey)
    let airdropFlashLoanReceiver = await AirdropFlashLoanReceiver.new();
    let userFlashclaimRegistry = await UserFlashclaimRegistry.new()
    initializeData = userFlashclaimRegistry.contract.methods.initialize(
        pawnProxyAdmin.address,
        bnftRegistry.address,
    ).encodeABI();

    proxy = await TransparentUpgradeableProxy.new(
        userFlashclaimRegistry.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );
    userFlashclaimRegistry = await UserFlashclaimRegistry.at(proxy.address)

    // NFT Oracle ---------------------------------------------------------------
    let mockNFTOracle = await MockNFTOracle.new();
    initializeData = mockNFTOracle.contract.methods.initialize(
        priceFeedAdmin,
        web3.utils.toWei('0.2', 'ether'), // _maxPriceDeviation 20%
        web3.utils.toWei('0.1', 'ether'), // _maxPriceDeviationWithTime 10%
        // 30 * 60,// 30 minutes
        1,
        // 10*60,//_minUpdateTime 10 minutes
        1,//_minUpdateTime
        // 10 * 60 // _twapInterval 10 minutes
        1,//_minUpdateTime
    ).encodeABI();
    mockNFTOracle = await TransparentUpgradeableProxy.new(
        mockNFTOracle.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );
    mockNFTOracle = await MockNFTOracle.at(mockNFTOracle.address)

    // nftOracle

    let nftOracle = await PawnNFTOracle.new();
    initializeData = nftOracle.contract.methods.initialize(
        priceFeedAdmin,
        // 10 * 60 // _twapInterval 10 minutes
        30,//_minUpdateTime
    ).encodeABI();

    nftOracle = await TransparentUpgradeableProxy.new(
        nftOracle.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );

    nftOracle = await PawnNFTOracle.at(nftOracle.address)

    // reserve oracle ---------------------------------------------------------------

    let mockUSDCChainlinkOracle = await MockChainlinkOracle.new(18);

    let reserveOracle = await ReserveOracle.new();

    initializeData = reserveOracle.contract.methods.initialize(weth.address).encodeABI();

    proxy = await TransparentUpgradeableProxy.new(
        reserveOracle.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );

    reserveOracle = await ReserveOracle.at(proxy.address);

    // config address ---------------------------------------------------------------
    await pawnProxyAdmin.createMultipleProxyImplementation(bnftMultipleUpgradeableProxy.address, bnft.address)
    await pawnProxyAdmin.createMultipleProxyImplementation(receiverMultipleUpgradeableProxy.address, airdropFlashLoanReceiver.address)

    await provider.setShopFactory(shopFactory.address, { from: pawnProxyAdminOwner })
    await provider.setBnftRegistry(bnftRegistry.address, { from: pawnProxyAdminOwner })
    await provider.setNftOracle(nftOracle.address, { from: pawnProxyAdminOwner })
    await provider.setReserveOracle(reserveOracle.address, { from: pawnProxyAdminOwner })
    await provider.setUserClaimRegistry(userFlashclaimRegistry.address, { from: pawnProxyAdminOwner })
    await provider.setLoanManager(shopLoan.address, { from: pawnProxyAdminOwner })
    await provider.setPlatformFeeReceiver(platformFeeReceiver, { from: pawnProxyAdminOwner })
    await provider.setMinBidFine(2);// 1 * 2 / 10000 = 0.0002 ETH
    // setting oracle price and reserve price ---------------------------------------------------------------

    await bnftRegistry.createBNFT(testNft.address)
    let rs = await bnftRegistry.bNftProxys(testNft.address);
    bnft = await BNFT.at(rs)

    await shopFactory.addNftCollection(testNft.address, 'Test Nft', 10000)
    await mockNFTOracle.addAsset(testNft.address, { from: pawnProxyAdminOwner });
    await nftOracle.addAsset(testNft.address, mockNFTOracle.address, testNft.address, '10000', { from: pawnProxyAdminOwner });

    await shopFactory.addReserve(weth.address)
    await shopFactory.addReserve(usdc.address)
    await reserveOracle.addAggregator(usdc.address, mockUSDCChainlinkOracle.address, { from: pawnProxyAdminOwner });

    await mockNFTOracle.setAssetData(testNft.address, web3.utils.toWei('0.1', 'ether'), { from: priceFeedAdmin });
    await mockUSDCChainlinkOracle.mockAddAnswer(1, web3.utils.toWei('0.001', 'ether'), 1666099852, 1666099852, 1);

    // WETHGateway
    let wethGateway = await WETHGateway.new();

    initializeData = wethGateway.contract.methods.initialize(
        provider.address,
        weth.address,
    ).encodeABI();

    proxy = await TransparentUpgradeableProxy.new(
        wethGateway.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
    );

    wethGateway = await WETHGateway.at(proxy.address);

    await wethGateway.authorizeLendPoolNFT([testNft.address], { from: pawnProxyAdminOwner })

    return {
        weth: weth,
        usdc: usdc,
        testNft: testNft,
        pawnProxyAdmin: pawnProxyAdmin,
        provider: provider,
        shopFactory: shopFactory,
        shopLoan: shopLoan,
        bnft: bnft,
        bnftRegistry: bnftRegistry,
        airdropFlashLoanReceiver: airdropFlashLoanReceiver,
        userFlashclaimRegistry: userFlashclaimRegistry,
        mockNFTOracle: mockNFTOracle,
        nftOracle: nftOracle,
        mockUSDCChainlinkOracle: mockUSDCChainlinkOracle,
        reserveOracle: reserveOracle,
        wethGateway: wethGateway,
        accounts: {
            pawnProxyAdminOwner: pawnProxyAdminOwner,
            priceFeedAdmin: priceFeedAdmin,
            platformFeeReceiver: platformFeeReceiver,
            lender: lender,
            borrower: borrower,
            bidder1: bidder1,
            bidder2: bidder2,
        }
    }
}