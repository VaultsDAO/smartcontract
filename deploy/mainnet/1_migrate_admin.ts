import fs from "fs";

import hre from "hardhat";
import helpers from "../helpers";

const { waitForDeploy, verifyContract, loadDB, saveDB } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 
    if (deployData.proxyAdminAddress == undefined || deployData.proxyAdminAddress == '') {
        let ProxyAdmin = await hre.ethers.getContractFactory('ProxyAdmin');
        let proxyAdmin = await waitForDeploy(await ProxyAdmin.deploy());
        {
            deployData.proxyAdminAddress = proxyAdmin.address;
            deployData = (await saveDB(network, deployData))
        }
        console.log('proxyAdmin is deployed', proxyAdmin.address)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.proxyAdminAddress,
            [],
            {},
            "@openzeppelin/contracts/proxy/ProxyAdmin.sol:ProxyAdmin",
        )
    }
}

// // We recommend this pattern to be able to use async/await everywhere
// // and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });