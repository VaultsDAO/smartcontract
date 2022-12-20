const fs = require('fs');
const verifyContract = require('./verify_contract.js');

const IWETH = artifacts.require("IWETH");
const ReserveOracle = artifacts.require("ReserveOracle");
const BNFTRegistry = artifacts.require("BNFTRegistry");
const ShopFactory = artifacts.require("ShopFactory");
const PunkGateway = artifacts.require("PunkGateway");

const PawnNFTOracle = artifacts.require("PawnNFTOracle");
const MockNFTOracle = artifacts.require("MockNFTOracle");
const MockNFT = artifacts.require("MockNFT");
const MockReserve = artifacts.require("MockReserve");

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
    let weth = await IWETH.at(deployData['WETH'])
    let shopFactory = await ShopFactory.at(deployData['ShopFactoryProxy']);
    let punkGateway = await PunkGateway.at(deployData['PunkGatewayProxy']);
    let reserveOracle = await ReserveOracle.at(deployData['ReserveOracleProxy']);
    // setup data
    {
      // for reserves
      try {
        await shopFactory.addReserve.estimateGas(weth.address)
        await shopFactory.addReserve(weth.address)
        console.log('shopFactory.addReserve', weth.address, '...Done')
      } catch (ex) {
        console.log('shopFactory.addReserve', weth.address, '...Failed')
      }
      try {
        await punkGateway.authorizeLendPoolERC20.estimateGas([weth.address])
        await punkGateway.authorizeLendPoolERC20([weth.address])
        console.log('punkGateway.authorizeLendPoolERC20', weth.address, '...Done')
      } catch (ex) {
        console.log('punkGateway.authorizeLendPoolERC20', weth.address, '...Failed', ex)
      }
      let reserves = deployData["Reserves"]
      for (let i = 0; i < reserves.length; i++) {
        let reserve = reserves[i]
        if (!reserve.Finished) {
          let reserveIns = await MockReserve.at(reserve.Address)
          try {
            await shopFactory.addReserve.estimateGas(reserveIns.address)
            await shopFactory.addReserve(reserveIns.address)
            console.log('shopFactory.addReserve', reserveIns.address, '...Done')
          } catch (ex) {
            console.log('shopFactory.addReserve', reserveIns.address, '...Failed')
          }
          try {
            await punkGateway.authorizeLendPoolERC20.estimateGas([reserveIns.address])
            await punkGateway.authorizeLendPoolERC20([reserveIns.address])
            console.log('punkGateway.authorizeLendPoolERC20', reserveIns.address, '...Done')
          } catch (ex) {
            console.log('punkGateway.authorizeLendPoolERC20', reserveIns.address, '...Failed', ex)
          }
          try {
            let rs = await reserveOracle.priceFeedMap(reserveIns.address)
            if (rs.toString() == '0x0000000000000000000000000000000000000000') {
              await reserveOracle.addAggregator.estimateGas(reserveIns.address, reserve.Aggregator)
              await reserveOracle.addAggregator(reserveIns.address, reserve.Aggregator)
              console.log('reserveOracle.addAggregator', reserveIns.address, '...Done')
            }
            rs = await reserveOracle.priceFeedMap(reserveIns.address)
            if (rs.toString() != reserve.Aggregator) {
              await reserveOracle.removeAggregator.estimateGas(reserveIns.address)
              await reserveOracle.removeAggregator(reserveIns.address)
              console.log('reserveOracle.removeAggregator', reserveIns.address, '...Done')
              await reserveOracle.addAggregator.estimateGas(reserveIns.address, reserve.Aggregator)
              await reserveOracle.addAggregator(reserveIns.address, reserve.Aggregator)
              console.log('reserveOracle.addAggregator', reserveIns.address, '...Done')
            }
          } catch (ex) {
            console.log('reserveOracle.addAggregator', reserveIns.address, '...Failed', ex)
          }
          reserve.Finished = true
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      }
    }
  }
};
