const fs = require('fs');

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
    console.log('truffle run verify PawnProxyAdmin@' + deployData['PawnProxyAdmin'] + ' --network ' + network)
    console.log('truffle run verify MockNFTOracle@' + deployData['MockNFTOracle'] + ' --network ' + network)
    console.log('truffle run verify MockNFTOracle@' + deployData['MockNFTOracleProxy'] + ' --custom-proxy TransparentUpgradeableProxy --network ' + network)
    console.log('truffle run verify ConfigProvider@' + deployData['ConfigProvider'] + ' --network ' + network)
    console.log('truffle run verify ConfigProvider@' + deployData['ConfigProviderProxy'] + ' --custom-proxy TransparentUpgradeableProxy --network ' + network)
    console.log('truffle run verify PawnNFTOracle@' + deployData['PawnNFTOracle'] + ' --network ' + network)
    console.log('truffle run verify PawnNFTOracle@' + deployData['PawnNFTOracleProxy'] + ' --custom-proxy TransparentUpgradeableProxy --network ' + network)
    console.log('truffle run verify ReserveOracle@' + deployData['ReserveOracle'] + ' --network ' + network)
    console.log('truffle run verify ReserveOracle@' + deployData['ReserveOracleProxy'] + ' --custom-proxy TransparentUpgradeableProxy --network ' + network)
    console.log('truffle run verify BNFT@' + deployData['BNFT'] + ' --network ' + network)
    console.log('truffle run verify MultipleUpgradeableProxy@' + deployData['BNFTMultipleUpgradeableProxy'] + ' --network ' + network)
    console.log('truffle run verify BNFTRegistry@' + deployData['BNFTRegistry'] + ' --network ' + network)
    console.log('truffle run verify BNFTRegistry@' + deployData['BNFTRegistryProxy'] + ' --custom-proxy TransparentUpgradeableProxy --network ' + network)
    console.log('truffle run verify AirdropFlashLoanReceiver@' + deployData['AirdropFlashLoanReceiver'] + ' --network ' + network)
    console.log('truffle run verify MultipleUpgradeableProxy@' + deployData['AirdropFlashLoanReceiverMultipleUpgradeableProxy'] + ' --network ' + network)
    console.log('truffle run verify UserFlashclaimRegistry@' + deployData['UserFlashclaimRegistry'] + ' --network ' + network)
    console.log('truffle run verify UserFlashclaimRegistry@' + deployData['UserFlashclaimRegistryProxy'] + ' --custom-proxy TransparentUpgradeableProxy --network ' + network)
    console.log('truffle run verify ValidationLogic@' + deployData['ValidationLogic'] + ' --network ' + network)
    console.log('truffle run verify LiquidateLogic@' + deployData['LiquidateLogic'] + ' --network ' + network)
    console.log('truffle run verify BorrowLogic@' + deployData['BorrowLogic'] + ' --network ' + network)
    console.log('truffle run verify ShopLoan@' + deployData['ShopLoan'] + ' --network ' + network)
    console.log('truffle run verify ShopLoan@' + deployData['ShopLoanProxy'] + ' --custom-proxy TransparentUpgradeableProxy --network ' + network)
    console.log('truffle run verify ShopFactory@' + deployData['ShopFactory'] + ' --network ' + network)
    console.log('truffle run verify ShopFactory@' + deployData['ShopFactoryProxy'] + ' --custom-proxy TransparentUpgradeableProxy --network ' + network)
  }
};