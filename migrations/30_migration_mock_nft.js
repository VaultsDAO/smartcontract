const MockNFT = artifacts.require("MockNFT");

module.exports = async function (deployer, network) {
  let options = deployer.options.networks[network]
  if (options.migration) {
    // 
    await deployer.deploy(MockNFT, 'MockBoredApeYachtClub', 'MBAYC', 'ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/');
    let testNft = await MockNFT.deployed();
    console.log('new NFT at ' + testNft.address)
  }
};
