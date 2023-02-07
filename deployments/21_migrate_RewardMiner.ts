import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { parseEther } from "ethers/lib/utils";
import { RewardMiner } from "../typechain";

const { waitForDeploy, verifyContract, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    const RewardMiner = await hre.ethers.getContractFactory("RewardMiner");
    // 
    const periodDuration = 43200;
    const starts = [
        1,
        361,
        721,
        1081,
        1441,
        1801,
        2161,
        2521,
        2881,
        3241,
        3601,
    ]
    const ends = [
        360,
        720,
        1080,
        1440,
        1800,
        2160,
        2520,
        2880,
        3240,
        3600,
        3960,
    ]
    const totals = [
        parseEther('25000'),
        parseEther('22500'),
        parseEther('20250'),
        parseEther('18225'),
        parseEther('16403'),
        parseEther('14762'),
        parseEther('13286'),
        parseEther('11957'),
        parseEther('10762'),
        parseEther('9686'),
        parseEther('3836'),
    ]
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    if (deployData.rewardMiner.implAddress == undefined || deployData.rewardMiner.implAddress == '') {
        const rewardMiner = await waitForDeploy(await RewardMiner.deploy())
        {
            deployData.rewardMiner.implAddress = rewardMiner.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('rewardMiner is deployed', rewardMiner.address)
        }
    }
    if (deployData.rewardMiner.address == undefined || deployData.rewardMiner.address == '') {
        let rewardMiner = await hre.ethers.getContractAt('RewardMiner', deployData.rewardMiner.implAddress);
        var initializeData = rewardMiner.interface.encodeFunctionData('initialize', [
            deployData.clearingHouse.address,
            deployData.pNFTToken.address,
            periodDuration,
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.rewardMiner.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.rewardMiner.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('rewardMiner TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.rewardMiner.address, deployData.rewardMiner.implAddress)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.rewardMiner.implAddress,
            [],
            {},
            "contracts/test/RewardMiner.sol:RewardMiner",
        )
    }
    {
        var rewardMiner = await hre.ethers.getContractAt('RewardMiner', deployData.rewardMiner.implAddress);
        var initializeData = rewardMiner.interface.encodeFunctionData('initialize', [
            deployData.clearingHouse.address,
            deployData.pNFTToken.address,
            periodDuration,
        ]);
        await verifyContract(
            deployData,
            network,
            deployData.rewardMiner.address,
            [
                deployData.rewardMiner.implAddress,
                proxyAdmin.address,
                initializeData,
            ],
            {},
            "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });