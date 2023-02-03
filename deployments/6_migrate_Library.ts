import fs from "fs";

import hre, { ethers } from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";

const { waitForDeploy, verifyContract, upgradeContract } = helpers;

async function main() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())

    // 
    const GenericLogic = await hre.ethers.getContractFactory("GenericLogic");
    //
    if (deployData.genericLogic.address == undefined || deployData.genericLogic.address == '') {
        const genericLogic = await waitForDeploy(await GenericLogic.deploy())
        {
            deployData.genericLogic.address = genericLogic.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('LiquidityLogic is deployed', genericLogic.address)
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
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('LiquidityLogic is deployed', liquidityLogic.address)
        }
    }
    if (deployData.exchangeLogic.address == undefined || deployData.exchangeLogic.address == '') {
        const exchangeLogic = await waitForDeploy(await ExchangeLogic.deploy())
        {
            deployData.exchangeLogic.address = exchangeLogic.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});