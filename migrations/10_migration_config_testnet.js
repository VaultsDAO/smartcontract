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

    if ((await configProvider.redeemDuration()).toString() != '14400') {
      console.log('configProvider.setRedeemDuration', 14400)
      await configProvider.setRedeemDuration(14400)
    }
    if ((await configProvider.auctionDuration()).toString() != '14400') {
      console.log('configProvider.setAuctionDuration', 14400)
      await configProvider.setAuctionDuration(14400)
    }
    if ((await configProvider.minBidFine()).toString() != '2000') {
      console.log('configProvider.setMinBidFine')
      await configProvider.setMinBidFine(2000)
    }
    if ((await configProvider.maxLoanDuration()).toString() != '31536000') {
      console.log('configProvider.setMaxLoanDuration')
      await configProvider.setMaxLoanDuration(31536000)
    }
    if ((await configProvider.interestDuration()).toString() != '3600') {
      console.log('configProvider.setInterestDuration')
      await configProvider.setInterestDuration(3600)
    }
    if ((await configProvider.liquidationBonus()).toString() != '2000') {
      console.log('configProvider.setLiquidationBonus')
      await configProvider.setLiquidationBonus(2000)
    }
    if ((await configProvider.platformFeePercentage()).toString() != '100') {
      console.log('configProvider.setPlatformFeePercentage')
      await configProvider.setPlatformFeePercentage(100)
    }
    if ((await configProvider.auctionFeePercentage()).toString() != '250') {
      console.log('configProvider.setAuctionFeePercentage')
      await configProvider.setAuctionFeePercentage(250)
    }
    if ((await configProvider.rebuyDuration()).toString() != '7200') {
      console.log('configProvider.setRebuyDuration')
      await configProvider.setRebuyDuration(7200)
    }
    if ((await configProvider.rebuyFeePercentage()).toString() != '500') {
      console.log('configProvider.setRebuyFeePercentage')
      await configProvider.setRebuyFeePercentage(500)
    }
  }
};
