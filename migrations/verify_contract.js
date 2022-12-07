const fs = require('fs');
const verify = require('truffle-plugin-verify');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async function (deployData, config, contractName, contractAddress, customProxy, forceConstructorArgs) {
    let fileName = process.cwd() + '/migrations/deployed_' + config.network + '.json';
    if (!deployData.VerifiedContracts[contractAddress]) {
        if (config.network != 'local' && config.network != 'development' && config.network != 'test') {
            if (config.network == 'goerli' || config.network == 'mainnet') {
                await sleep(24000)
            } else {
                await sleep(6000)
            }
            config._ = ['verify', contractName + '@' + contractAddress]
            config['custom-proxy'] = undefined
            if (customProxy != undefined && customProxy != '') {
                config['custom-proxy'] = customProxy
            }
            config.forceConstructorArgs = undefined
            if (forceConstructorArgs != undefined && forceConstructorArgs != '') {
                config.forceConstructorArgs = 'string:' + forceConstructorArgs
            }
            await verify(
                config,
            )
        }
        deployData.VerifiedContracts[contractAddress] = true
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
    }
};