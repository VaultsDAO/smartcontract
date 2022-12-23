module.exports = {
    setupInstance: async () => {
        let [deployAdmin, platformFeeReceiver, curator, buyer1, buyer2] = await ethers.getSigners();

        let ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
        let TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
        let ConfigProvider = await ethers.getContractFactory("ConfigProvider");
        let VaultFactory = await ethers.getContractFactory("VaultFactory");
        let TokenVault = await ethers.getContractFactory("TokenVault");
        let TokenVaultProxy = await ethers.getContractFactory("TokenVaultProxy");

        let proxyAdmin = await ProxyAdmin.connect(deployAdmin).deploy();

        let configProvider = await ConfigProvider.connect(deployAdmin).deploy();
        let initializeData = configProvider.interface.encodeFunctionData('initialize', []);
        let configProviderProxy = await TransparentUpgradeableProxy.connect(deployAdmin).deploy(
            configProvider.address,
            proxyAdmin.address,
            initializeData,
        );

        configProvider = await ethers.getContractAt('ConfigProvider', configProviderProxy.address)

        let tokenVaultProxy = await TokenVaultProxy.connect(deployAdmin).deploy(configProvider.address);

        await configProvider.connect(deployAdmin).setVaultTpl(tokenVaultProxy.address);

        // let configProvider2 = await ConfigProvider.connect(deployAdmin).deploy();
        // await ProxyAdmin.connect(deployAdmin).upgrade(configProviderProxy.address, configProvider2.address)

        let vaultFactory = await VaultFactory.connect(deployAdmin).deploy(configProvider.address);
        initializeData = vaultFactory.interface.encodeFunctionData('initialize', []);
        let vaultFactoryProxy = await TransparentUpgradeableProxy.connect(deployAdmin).deploy(
            vaultFactory.address,
            proxyAdmin.address,
            initializeData,
        );
        vaultFactory = await ethers.getContractAt('VaultFactory', vaultFactoryProxy.address)

        let tokenVault = await TokenVault.connect(deployAdmin).deploy(configProvider.address);
        await configProvider.connect(deployAdmin).setVaultImpl(tokenVault.address)

        //
        let MockNFT = await ethers.getContractFactory("MockNFT");
        let testNft = await MockNFT.connect(curator).deploy('XXX', 'XXX');
        return {
            proxyAdmin: proxyAdmin,
            configProvider: configProvider,
            vaultFactory: vaultFactory,
            testNft: testNft,
            accounts: {
                curator: curator,
                buyer1: buyer1,
                buyer2: buyer2,
            }
        }
    }
}
