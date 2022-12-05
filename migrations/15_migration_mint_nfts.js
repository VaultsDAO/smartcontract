const fs = require('fs');
const verifyContract = require('./verify_contract.js');

const MockNFT = artifacts.require("MockNFT");

module.exports = async function (deployer, network) {
  let options = deployer.options.networks[network]
  if (options.migration) {
    // 
    let fileName = process.cwd() + '/migrations/deployed_' + network + '.json';
    let deployData = {}
    if (!(await fs.existsSync(fileName))) {
      throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 
    if (network != 'mainnet') {
      // setup data
      {
        // for nfts
        let collections = deployData["Nfts"]
        for (let i = 0; i < collections.length; i++) {
          let collection = collections[i]
          let testNft = await MockNFT.at(collection.Address);
          try {
            await testNft.mint.estimateGas(deployer.options.from, 1)
            await testNft.mint(deployer.options.from, 1)
            console.log('testNft.mint', testNft.address, '1', '...Done')
          } catch (ex) {
            console.log('testNft.mint', testNft.address, '1', '...Failed')
          }
        }
      }
    }
  }
};
