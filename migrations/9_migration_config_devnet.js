const fs = require('fs');

const ConfigProvider = artifacts.require("ConfigProvider");

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
    let configProvider = await ConfigProvider.at(deployData['ConfigProviderProxy']);
    // 
    if ((await configProvider.redeemDuration()).toString() != '1800') {
      console.log('configProvider.setRedeemDuration')
      await configProvider.setRedeemDuration(1800)
    }
    if ((await configProvider.auctionDuration()).toString() != '1800') {
      console.log('configProvider.setAuctionDuration')
      await configProvider.setAuctionDuration(1800)
    }
    if ((await configProvider.minBidFine()).toString() != '20') {
      console.log('configProvider.setMinBidFine')
      await configProvider.setMinBidFine(20)
    }
    if ((await configProvider.maxLoanDuration()).toString() != '3600') {
      console.log('configProvider.setMaxLoanDuration')
      await configProvider.setMaxLoanDuration(3600)
    }
    if ((await configProvider.interestDuration()).toString() != '600') {
      console.log('configProvider.setInterestDuration')
      await configProvider.setInterestDuration(600)
    }
    if ((await configProvider.liquidationBonus()).toString() != '2000') {
      console.log('configProvider.setLiquidationBonus')
      await configProvider.setLiquidationBonus(2000)
    }
    if ((await configProvider.platformFeePercentage()).toString() != '100') {
      console.log('configProvider.setPlatformFeePercentage')
      await configProvider.setPlatformFeePercentage(100)
    }
  }
};
