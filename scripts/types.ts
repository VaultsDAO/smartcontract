type NftData = {
  Address: string,
  Symbol: string,
  Name: string,
  Total: Number,
  BaseURI: string,
}

type ReserveData = {
  Address: string,
  Symbol: string,
  Name: string,
  Decimals: BigNumber,
}

type DeployData = {
  VerifiedContracts: any,
  ProxyAdmin: string,
  ConfigProvider: string,
  ConfigProviderProxy: string,
  FragmentFactory: string,
  FragmentFactoryProxy: string,
  FragmentNFT: string,
  FragmentNFTProxy: string,
  MockNFT: string,
};