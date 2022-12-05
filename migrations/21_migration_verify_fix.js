module.exports = async function (deployer, network) {
  let options = deployer.options.networks[network]
  if (options.migration) {
    let data = web3.eth.abi.encodeFunctionCall({
      name: 'initialize',
      type: 'function',
      inputs: [{
        type: 'address',
        name: 'address'
      }, {
        type: 'address',
        name: 'address'
      }]
    }, ['0xdf34d26e97326Ef7bD740c2d623b4C9792369424', '0x72d70cB279561Bd1c561Cd8CE1D96150ea35Ad9B']);
    let argHex = web3.eth.abi.encodeParameters(
      [
        'address', 'address', 'bytes',
      ],
      [
        '0x72d70cB279561Bd1c561Cd8CE1D96150ea35Ad9B', '0xdf34d26e97326Ef7bD740c2d623b4C9792369424', data,
      ],
    )
    console.log('truffle run verify Contract@address --network ' + network + ' --forceConstructorArgs string:' + argHex.slice(2))
    console.log('truffle run verify Contract@address --custom-proxy TransparentUpgradeableProxy --network ' + network + ' --forceConstructorArgs string:' + argHex.slice(2))
  }
};