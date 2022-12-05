var BN = web3.utils.BN;
module.exports = {
    LoanState: {
        None: 0, //The loan data is stored, but not initiated yet.
        Created: 1, // The loan has been initialized, funds have been delivered to the borrower and the collateral is held.
        Active: 2, //The loan is in auction, higest price liquidator will got chance to claim it.
        Auction: 3,// The loan has been repaid, and the collateral has been returned to the borrower. This is a terminal state.
        Repaid: 4,// The loan was delinquent and collateral claimed by the liquidator. This is a terminal state.
        Defaulted: 5,// The loan was delinquent and collateral claimed by the liquidator. This is a terminal state.
    },
    getResultFromLogs: function (decoder, rawLogs, event) {
        let rs = []
        let logs = decoder.decodeLogs(rawLogs)
        for (let i = 0; i < logs.length; i++) {
            let log = logs[i]
            if (log.event == event) {
                rs.push(log.args)
            }
        }
        return rs
    },

    waitAndEvmMine: async function (ms) {
        await this.sleep(ms)
        await this.evmMine();
    },

    sleep: function (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    evmMine: function () {
        return new Promise((resolve, reject) => {
            web3.currentProvider.send({
                jsonrpc: "2.0",
                method: "evm_mine",
                id: new Date().getTime()
            }, (error, result) => {
                if (error) {
                    return reject(error);
                }
                return resolve(result);
            });
        });
    },

    getResultFromLog: function (decoder, rawLogs, event) {
        let logs = decoder.decodeLogs(rawLogs)
        for (let i = 0; i < logs.length; i++) {
            let log = logs[i]
            if (log.event == event) {
                return log.args
            }
        }
        return ''
    },

    verifyOwnerNft: async function (nftAddress, tokenId, owner) {
        //verify owner nft
        let currentOwner = await nftAddress.ownerOf(tokenId)
        return currentOwner.toString() == owner.toString()
    },

    verifyBalance: async function (token, user, beforeBalance, added, taken) {
        let currentBalance = await token.balanceOf(user)
        return new BN(beforeBalance).add(new BN(added)).sub(new BN(taken)).sub(new BN(currentBalance)) == 0;
    },

    verifyETHBalance: async function (user, beforeBalance, added, taken) {
        let currentBalance = await web3.eth.getBalance(user)
        return new BN(beforeBalance).add(new BN(added)).sub(new BN(taken)).sub(new BN(currentBalance)) == 0;
    },

    verifyLoanState: async function (shopLoan, loanId, state) {
        let rs = await shopLoan.getLoan(loanId)
        return rs.state == state
    },

    logPreBalances: async function (preBalances, token, addresses) {
        for (var i = 0; i < addresses.length; i++) {
            let tmp = await token.balanceOf(addresses[i])
            preBalances[addresses[i]] = tmp
        }
        return preBalances
    },

    logPreETHBalances: async function (preBalances, addresses) {
        for (var i = 0; i < addresses.length; i++) {
            let tmp = await web3.eth.getBalance(addresses[i])
            preBalances[addresses[i]] = tmp
        }
        return preBalances
    },

    gasCost: async function (rs) {
        let gasUsed = rs.receipt.gasUsed
        let tx = await web3.eth.getTransaction(rs.tx);
        let gasPrice = tx.gasPrice;
        return new BN(gasUsed).mul(new BN(gasPrice))
    }

}