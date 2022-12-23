module.exports = {
    setupInstance: async () => {
        let [deployAdmin, platformFeeReceiver, curator, buyer1, buyer2] = await ethers.getSigners();

        let ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
        let TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
        let ConfigProvider = await ethers.getContractFactory("ConfigProvider");
        let FragmentFactory = await ethers.getContractFactory("FragmentFactory");
        let FragmentNFT = await ethers.getContractFactory("FragmentNFT");
        let FragmentNFTProxy = await ethers.getContractFactory("FragmentNFTProxy");

        let proxyAdmin = await ProxyAdmin.connect(deployAdmin).deploy();

        let configProvider = await ConfigProvider.connect(deployAdmin).deploy();
        let initializeData = configProvider.interface.encodeFunctionData('initialize', []);
        let configProviderProxy = await TransparentUpgradeableProxy.connect(deployAdmin).deploy(
            configProvider.address,
            proxyAdmin.address,
            initializeData,
        );

        configProvider = await ethers.getContractAt('ConfigProvider', configProviderProxy.address)

        let fragmentNFTProxy = await FragmentNFTProxy.connect(deployAdmin).deploy(configProvider.address);

        await configProvider.connect(deployAdmin).setFragmentTpl(fragmentNFTProxy.address);

        // let configProvider2 = await ConfigProvider.connect(deployAdmin).deploy();
        // await ProxyAdmin.connect(deployAdmin).upgrade(configProviderProxy.address, configProvider2.address)

        let fragmentFactory = await FragmentFactory.connect(deployAdmin).deploy(configProvider.address);
        initializeData = fragmentFactory.interface.encodeFunctionData('initialize', []);
        let fragmentFactoryProxy = await TransparentUpgradeableProxy.connect(deployAdmin).deploy(
            fragmentFactory.address,
            proxyAdmin.address,
            initializeData,
        );
        fragmentFactory = await ethers.getContractAt('FragmentFactory', fragmentFactoryProxy.address)

        let tokenFragment = await FragmentNFT.connect(deployAdmin).deploy(configProvider.address);
        await configProvider.connect(deployAdmin).setFragmentImpl(tokenFragment.address)

        //
        let MockNFT = await ethers.getContractFactory("MockNFT");
        let testNft = await MockNFT.connect(curator).deploy('XXX', 'XXX');
        return {
            proxyAdmin: proxyAdmin,
            configProvider: configProvider,
            fragmentFactory: fragmentFactory,
            testNft: testNft,
            accounts: {
                curator: curator,
                buyer1: buyer1,
                buyer2: buyer2,
            }
        }
    }
}
