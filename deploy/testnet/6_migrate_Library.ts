import fs from "fs";

import hre, { ethers } from "hardhat";
import helpers from "../helpers";

import { ProxyAdmin } from "../../typechain/openzeppelin/ProxyAdmin";
import { FundingLogic } from "../../typechain";

const {  waitForDeploy, verifyContract, loadDB, saveDB, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))

    // 
    const GenericLogic = await hre.ethers.getContractFactory("GenericLogic");
    if (deployData.genericLogic.address == undefined || deployData.genericLogic.address == '') {
        const genericLogic = await waitForDeploy(await GenericLogic.deploy())
        {
            deployData.genericLogic.address = genericLogic.address;
            deployData = (await saveDB(network, deployData))
            console.log('GenericLogic is deployed', genericLogic.address)
        }
    }
    const VaultLogic = await hre.ethers.getContractFactory("VaultLogic");
    if (deployData.vaultLogic.address == undefined || deployData.vaultLogic.address == '') {
        const vaultLogic = await waitForDeploy(await VaultLogic.deploy())
        {
            deployData.vaultLogic.address = vaultLogic.address;
            deployData = (await saveDB(network, deployData))
            console.log('VaultLogic is deployed', vaultLogic.address)
        }
    }
    const FundingLogic = await hre.ethers.getContractFactory("FundingLogic");
    if (deployData.fundingLogic.address == undefined || deployData.fundingLogic.address == '') {
        const fundingLogic = await waitForDeploy(await FundingLogic.deploy())
        {
            deployData.fundingLogic.address = fundingLogic.address;
            deployData = (await saveDB(network, deployData))
            console.log('FundingLogic is deployed', fundingLogic.address)
        }
    }
    var genericLogic = await hre.ethers.getContractAt('GenericLogic', deployData.genericLogic.address);
    const LiquidityLogic = await hre.ethers.getContractFactory("LiquidityLogic", {
        libraries: {
            GenericLogic: genericLogic.address,
        },
    });
    const ExchangeLogic = await hre.ethers.getContractFactory("ExchangeLogic", {
        libraries: {
            GenericLogic: genericLogic.address,
        },
    });
    if (deployData.liquidityLogic.address == undefined || deployData.liquidityLogic.address == '') {
        const liquidityLogic = await waitForDeploy(await LiquidityLogic.deploy())
        {
            deployData.liquidityLogic.address = liquidityLogic.address;
            deployData = (await saveDB(network, deployData))
            console.log('LiquidityLogic is deployed', liquidityLogic.address)
        }
    }
    if (deployData.exchangeLogic.address == undefined || deployData.exchangeLogic.address == '') {
        const exchangeLogic = await waitForDeploy(await ExchangeLogic.deploy())
        {
            deployData.exchangeLogic.address = exchangeLogic.address;
            deployData = (await saveDB(network, deployData))
            console.log('ExchangeLogic is deployed', exchangeLogic.address)
        }
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.genericLogic.address,
            [],
            {},
            "contracts/lib/GenericLogic.sol:GenericLogic",
        )
    }
    {
        var genericLogic = await hre.ethers.getContractAt('GenericLogic', deployData.genericLogic.address);
        await verifyContract(
            deployData,
            network,
            deployData.liquidityLogic.address,
            [],
            {
                GenericLogic: genericLogic.address,
            },
            "contracts/lib/LiquidityLogic.sol:LiquidityLogic",
        )
    }
    {
        var genericLogic = await hre.ethers.getContractAt('GenericLogic', deployData.genericLogic.address);
        await verifyContract(
            deployData,
            network,
            deployData.exchangeLogic.address,
            [],
            {
                GenericLogic: genericLogic.address,
            },
            "contracts/lib/ExchangeLogic.sol:ExchangeLogic",
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });