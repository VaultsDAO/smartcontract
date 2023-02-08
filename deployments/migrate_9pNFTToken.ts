import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";
import { parseEther } from "ethers/lib/utils";
import { PNFTToken } from "../typechain/PNFTToken";

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
    const PNFTToken = await hre.ethers.getContractFactory("PNFTToken");
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    // 
    // if (deployData.pNFTToken.implAddress == undefined || deployData.pNFTToken.implAddress == '') 
    {
        const pNFTToken = await waitForDeploy(await PNFTToken.deploy())
        {
            deployData.pNFTToken.implAddress = pNFTToken.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('pNFTToken is deployed', pNFTToken.address)
        }
    }
    // if (deployData.pNFTToken.address == undefined || deployData.pNFTToken.address == '') {
    {
        var pNFTToken = await hre.ethers.getContractAt('PNFTToken', deployData.pNFTToken.implAddress);
        var initializeData = pNFTToken.interface.encodeFunctionData('initialize', [
            deployData.pNFTToken.name,
            deployData.pNFTToken.symbol,
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.pNFTToken.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.pNFTToken.address = transparentUpgradeableProxy.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            console.log('pNFTToken TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.pNFTToken.address, deployData.pNFTToken.implAddress)
    }
    {
        //add schedules

        pNFTToken = (await hre.ethers.getContractAt('PNFTToken', deployData.pNFTToken.address)) as PNFTToken;
        let numSchedules = await pNFTToken.getVestingSchedulesCount();


        if (numSchedules == 0) {
            console.log(numSchedules);
            const startTime = Math.floor(Date.now() / 1000);
            const cliff = 0;
            let duration = 5184000;//1440 days in seconds (4 years)
            let slicePeriodSeconds = 1296000;//360 days in seconds (1 year)
            const revokable = true;
            let unvestingAmount = parseEther("4000000");//4M
            let amount = parseEther("16000000");//16M
            console.log(unvestingAmount.toString());
            console.log(amount.toString());
            //add Core schedule 
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.coreAddress,
                startTime,
                cliff,
                duration,
                slicePeriodSeconds,
                revokable,
                unvestingAmount,
                amount,
            );
            return;
            //add treasury schedule
            duration = 2592000;//720 days in seconds (2 years)
            slicePeriodSeconds = 648000;//180days in seconds
            unvestingAmount = parseEther("4000000");//4M
            amount = parseEther("16000000");//16M
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.treasuryAddress,
                startTime,
                cliff,
                duration,
                slicePeriodSeconds,
                revokable,
                unvestingAmount,
                amount,
            );
            //add reward schedule
            //#1
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                648000,//180 days
                648000,//180 days
                revokable,
                parseEther("9000000"),
                parseEther("8100000"),
            );
            //#2
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                1296000,//360 days
                1296000,//360 days
                revokable,
                0,
                parseEther("7290000"),
            );
            //#3
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                1944000,//540 days
                1944000,//540 days
                revokable,
                0,
                parseEther("6561000"),
            );
            //#4
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                2592000,//720 days
                2592000,//720 days
                revokable,
                0,
                parseEther("5904900"),
            );
            //#5
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                3240000,//900 days
                3240000,//900 days
                revokable,
                0,
                parseEther("5314410"),
            );
            //#6
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                3888000,//1080 days
                3888000,//1080 days
                revokable,
                0,
                parseEther("4782969"),
            );
            //#7
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                4536000,//1260 days
                4536000,//1260 days
                revokable,
                0,
                parseEther("4304672"),
            );
            //#8
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                5184000,//1440 days
                5184000,//1440 days
                revokable,
                0,
                parseEther("3874205"),
            );
            //#9
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                5832000,//1620 days
                5832000,//1620 days
                revokable,
                0,
                parseEther("3486784"),
            );
            //#10
            await pNFTToken.createVestingSchedule(
                deployData.pNFTToken.rewardAddress,
                startTime,
                cliff,
                6480000,//1800 days
                6480000,//1800 days
                revokable,
                0,
                parseEther("1381060"),
            );

        }
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.pNFTToken.implAddress,
            [],
            {},
            "contracts/test/PNFTToken.sol:PNFTToken",
        )
    }
    {
        var pNFTToken = await hre.ethers.getContractAt('PNFTToken', deployData.pNFTToken.implAddress);
        var initializeData = pNFTToken.interface.encodeFunctionData('initialize', [
            deployData.pNFTToken.name,
            deployData.pNFTToken.symbol,
        ]);
        await verifyContract(
            deployData,
            network,
            deployData.pNFTToken.address,
            [
                deployData.pNFTToken.implAddress,
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});