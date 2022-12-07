const fs = require('fs');

const verifyContract = require('./verify_contract.js');

const CryptoPunksMarket = artifacts.require("CryptoPunksMarket");
const WrappedPunk = artifacts.require("WrappedPunk");

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
    let cryptoPunksMarket;
    {
      if (deployData['CryptoPunksMarket'] == undefined || deployData['CryptoPunksMarket'] == '') {
        await deployer.deploy(CryptoPunksMarket);
        cryptoPunksMarket = await CryptoPunksMarket.deployed();
        {
          deployData['CryptoPunksMarket'] = cryptoPunksMarket.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        cryptoPunksMarket = await CryptoPunksMarket.at(deployData['CryptoPunksMarket']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'CryptoPunksMarket',
      deployData['CryptoPunksMarket'],
      '',
    )
    let wrappedPunk;
    {
      if (deployData['WrappedPunk'] == undefined || deployData['WrappedPunk'] == '') {
        await deployer.deploy(WrappedPunk, cryptoPunksMarket.address);
        wrappedPunk = await WrappedPunk.deployed();
        {
          deployData['WrappedPunk'] = wrappedPunk.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        wrappedPunk = await WrappedPunk.at(deployData['WrappedPunk']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'WrappedPunk',
      deployData['WrappedPunk'],
      '',
    )
  }
};
