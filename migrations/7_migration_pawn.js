const fs = require('fs');

const verifyContract = require('./verify_contract.js');
const upgradeContract = require('./upgrade_contract.js');

const IWETH = artifacts.require("IWETH");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const ConfigProvider = artifacts.require("ConfigProvider");
const ShopFactory = artifacts.require("ShopFactory");
const ShopLoan = artifacts.require("ShopLoan");
const BorrowLogic = artifacts.require("BorrowLogic");
const LiquidateLogic = artifacts.require("LiquidateLogic");
const ValidationLogic = artifacts.require("ValidationLogic");

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
    // for WETH
    let weth = await IWETH.at(deployData['WETH'])
    // pawnProxyAdmin
    let pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    // configProvider
    let configProvider = await ConfigProvider.at(deployData['ConfigProviderProxy']);
    // 
    let validationLogic;
    {
      if (deployData['ValidationLogic'] == undefined || deployData['ValidationLogic'] == '') {
        await deployer.deploy(ValidationLogic);
        validationLogic = await ValidationLogic.deployed();
        {
          deployData['ValidationLogic'] = validationLogic.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        validationLogic = await ValidationLogic.at(deployData['ValidationLogic']);
      }
    }
    await deployer.link(validationLogic, LiquidateLogic);
    let liquidateLogic;
    {
      if (deployData['LiquidateLogic'] == undefined || deployData['LiquidateLogic'] == '') {
        await deployer.deploy(LiquidateLogic);
        liquidateLogic = await LiquidateLogic.deployed();
        {
          deployData['LiquidateLogic'] = liquidateLogic.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        liquidateLogic = await LiquidateLogic.at(deployData['LiquidateLogic']);
      }
    }
    await deployer.link(validationLogic, BorrowLogic);
    let borrowLogic;
    {
      if (deployData['BorrowLogic'] == undefined || deployData['BorrowLogic'] == '') {
        await deployer.deploy(BorrowLogic);
        borrowLogic = await BorrowLogic.deployed();
        {
          deployData['BorrowLogic'] = borrowLogic.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        borrowLogic = await BorrowLogic.at(deployData['BorrowLogic']);
      }
    }
    // ShopLoan
    let shopLoan;
    {
      if (deployData['ShopLoan'] == undefined || deployData['ShopLoan'] == '') {
        await deployer.deploy(ShopLoan);
        shopLoan = await ShopLoan.deployed();
        {
          deployData['ShopLoan'] = shopLoan.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        shopLoan = await ShopLoan.at(deployData['ShopLoan']);
      }
    }
    // ShopLoanProxy
    if (deployData['ShopLoanProxy'] == undefined || deployData['ShopLoanProxy'] == '') {
      let initializeData = shopLoan.contract.methods.initialize(configProvider.address).encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        shopLoan.address,
        pawnProxyAdmin.address,
        initializeData
      );
      shopLoan = await TransparentUpgradeableProxy.deployed();
      {
        deployData['ShopLoanProxy'] = shopLoan.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    // ShopFactory
    await deployer.link(borrowLogic, ShopFactory);
    await deployer.link(liquidateLogic, ShopFactory);
    let shopFactory;
    {
      if (deployData['ShopFactory'] == undefined || deployData['ShopFactory'] == '') {
        await deployer.deploy(ShopFactory);
        shopFactory = await ShopFactory.deployed();
        {
          deployData['ShopFactory'] = shopFactory.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        shopFactory = await ShopFactory.at(deployData['ShopFactory']);
      }
    }
    // ShopFactoryProxy
    if (deployData['ShopFactoryProxy'] == undefined || deployData['ShopFactoryProxy'] == '') {
      let initializeData = shopFactory.contract.methods.initialize(configProvider.address).encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        shopFactory.address,
        pawnProxyAdmin.address,
        initializeData
      );
      shopFactory = await TransparentUpgradeableProxy.deployed();
      {
        deployData['ShopFactoryProxy'] = shopFactory.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    // 
    await upgradeContract(pawnProxyAdmin, deployData['ShopLoanProxy'], deployData['ShopLoan']);
    // 
    await upgradeContract(pawnProxyAdmin, deployData['ShopFactoryProxy'], deployData['ShopFactory']);
    // 
    await verifyContract(
      deployData,
      config,
      'ValidationLogic',
      deployData['ValidationLogic'],
      '',
    )
    await verifyContract(
      deployData,
      config,
      'LiquidateLogic',
      deployData['LiquidateLogic'],
      '',
    )
    await verifyContract(
      deployData,
      config,
      'BorrowLogic',
      deployData['BorrowLogic'],
      '',
    )
    await verifyContract(
      deployData,
      config,
      'ShopLoan',
      deployData['ShopLoan'],
      '',
    )
    await verifyContract(
      deployData,
      config,
      'ShopLoan',
      deployData['ShopLoanProxy'],
      'TransparentUpgradeableProxy',
    )
    await verifyContract(
      deployData,
      config,
      'ShopFactory',
      deployData['ShopFactory'],
      '',
    )
    await verifyContract(
      deployData,
      config,
      'ShopFactory',
      deployData['ShopFactoryProxy'],
      'TransparentUpgradeableProxy',
    )
  }
};
