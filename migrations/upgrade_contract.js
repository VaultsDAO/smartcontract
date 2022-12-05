module.exports = async function (pawnProxyAdmin, proxyAddress, implAddress) {
    if ((await pawnProxyAdmin.getProxyImplementation(proxyAddress)).toString() != implAddress) {
        await pawnProxyAdmin.upgrade(proxyAddress, implAddress);
        console.log('pawnProxyAdmin.upgrade()', proxyAddress, implAddress)
    }
};