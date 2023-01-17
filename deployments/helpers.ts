import fs from "fs";

import hre, { ethers } from "hardhat";
import { BaseContract, ContractTransaction, Signer } from "ethers";
import { ProxyAdmin } from "../typechain/openzeppelin/ProxyAdmin";

const res = {
    getDeploySigner: async (): Promise<Signer> => {
        const ethersSigners = await Promise.all(await ethers.getSigners());
        return ethersSigners[0];
    },
    waitForDeploy: async (contract: BaseContract, note: string = ''): Promise<BaseContract> => {
        var tx: ContractTransaction = contract.deployTransaction
        console.log(note, 'deploy contract', contract.address, 'at', tx.hash, 'waiting...')
        await tx.wait(1)
        console.log(note, 'deploy contract', contract.address, 'at', tx.hash, 'confirmed')
        return contract
    },
    waitForTx: async (tx: ContractTransaction, note: string = '') => {
        console.log(note, 'contract call method at', tx.hash, 'waiting...')
        await tx.wait(1)
        console.log(note, 'contract call method at', tx.hash, 'confirmed')
    },
    tryWaitForTx: async (tx: ContractTransaction, note: string = '') => {
        console.log(note, 'contract call method at', tx.hash, 'waiting...')
        try {
            await tx.wait(1)
        } catch (ex) {
            console.log(note, 'contract call method at', tx.hash, 'error', ex)
            return
        }
        console.log(note, 'contract call method at', tx.hash, 'confirmed')
    },
    sleep: (ms: number) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    verifyContract: async (deployData: DeployData, network: string, address: string, constructorArguments: any, libraries: any, contract: string) => {
        return;
        if (network != 'local') {
            var verified = deployData.verifiedContracts[address]
            if (verified == undefined || verified == false) {
                try {
                    await hre.run("verify:verify", {
                        address: address,
                        constructorArguments: constructorArguments,
                        libraries: libraries,
                        contract: contract,
                    })
                } catch (ex) {
                    var err = '' + ex
                    if (!err.includes('Already Verified')) {
                        throw ex
                    }
                    console.log('Already verified contract address on Etherscan.')
                    console.log('https://testnet.arbiscan.io//address/' + address + '#code')
                }
                deployData.verifiedContracts[address] = true
                let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
            }
        }
    },
    upgradeContract: async (proxyAdmin: ProxyAdmin, address: string, implAddress: string) => {
        if ((await proxyAdmin.getProxyImplementation(address)) != implAddress) {
            var tx = await proxyAdmin.upgrade(address, implAddress)
            console.log('proxyAdmin.upgrade at', address, implAddress, tx.hash, 'waiting...')
            await tx.wait(1)
            console.log('proxyAdmin.upgrade at', address, implAddress, tx.hash, 'confirmed')
        }
    },
};

export default res;