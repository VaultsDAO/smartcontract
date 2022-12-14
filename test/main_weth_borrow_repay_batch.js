const Ishop = artifacts.require("Ishop");

var BN = web3.utils.BN;

var utils = require('./utils.js')

/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */

contract("Factory", function (accounts) {

  const [pawnProxyAdminOwner, priceFeedAdmin, platformFeeReceiver, lender, borrower, bidder1, bidder2] = accounts;

  it("new loan", async function () {
    // setup
    let deployment = await require('./setup.js')(accounts)

    let weth = deployment.weth
    let usdc = deployment.usdc
    let testNft = deployment.testNft
    let pawnProxyAdmin = deployment.pawnProxyAdmin
    let provider = deployment.provider
    let shopFactory = deployment.shopFactory
    let shopLoan = deployment.shopLoan
    let bnft = deployment.bnft
    let bnftRegistry = deployment.bnftRegistry
    let userFlashclaimRegistry = deployment.userFlashclaimRegistry
    let mockNFTOracle = deployment.mockNFTOracle
    let nftOracle = deployment.nftOracle
    let mockUSDCChainlinkOracle = deployment.mockUSDCChainlinkOracle
    let reserveOracle = deployment.reserveOracle

    // for tesing ---------------------------------------------------------------
    let preETHBalances = {}
    let preWETHBalances = {}
    let testAddress = [lender, borrower, bidder1, bidder2, shopFactory.address, platformFeeReceiver]

    rs = await shopFactory.shops('1')
    // console.log(rs)

    await shopFactory.setShopConfigurations(
      [
        {
          reserveAddress: weth.address,
          nftAddress: testNft.address,
          interestRate: 1000,
          ltvRate: 4000,
          active: true
        }
      ],
      { from: lender }
    )

    //faucet
    await weth.deposit({ value: web3.utils.toWei('0.2', 'ether'), from: lender })
    await weth.deposit({ value: web3.utils.toWei('0.2', 'ether'), from: borrower })

    await weth.approve(shopFactory.address, web3.utils.toWei('1000', 'ether'), { from: lender })
    await weth.approve(shopFactory.address, web3.utils.toWei('1000', 'ether'), { from: borrower })

    await testNft.mint(borrower, '1', { from: borrower });
    await testNft.mint(borrower, '2', { from: borrower });

    //========================borrow 
    await testNft.setApprovalForAll(shopFactory.address, true, { from: borrower });

    let borrowAmount1 = new BN(web3.utils.toWei('0.01', 'ether'))
    let borrowAmount2 = new BN(web3.utils.toWei('0.02', 'ether'))

    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)

    rs = await shopFactory.batchBorrow(
      '1',
      [weth.address, weth.address],
      [borrowAmount1, borrowAmount2],
      [testNft.address, testNft.address],
      ['1', '2'],
      borrower,
      { from: borrower }
    );
    let logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Borrow')
    let loanId1 = logs[0].loanId
    let loanId2 = logs[1].loanId

    //verify borrower balance (borrowAmount1 + borrowAmount2 )
    assert.isTrue(await utils.verifyBalance(weth, borrower, preWETHBalances[borrower], borrowAmount1.add(borrowAmount2), 0))
    //verify lender balance ( -(borrowAmount1 + borrowAmount2))
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], 0, borrowAmount1.add(borrowAmount2)))

    //verify owner nft (bnft)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, bnft.address))
    assert.isTrue(await utils.verifyOwnerNft(testNft, 2, bnft.address))

    //========================repay ETH
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)

    rs = await shopLoan.getNftDebtData(
      loanId1,
      { from: borrower }
    );

    let totalDebt1 = rs.totalDebt

    rs = await shopLoan.getNftDebtData(
      loanId2,
      { from: borrower }
    );

    let totalDebt2 = rs.totalDebt

    rs = await shopFactory.batchRepay(
      '1',
      [loanId1, loanId2],
      [totalDebt1, totalDebt2],
      { from: borrower }
    );
    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Repay')
    let fee1 = logs[0].feeAmount
    let fee2 = logs[1].feeAmount

    //verify loan status (Repaid)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Repaid))
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId2, utils.LoanState.Repaid))

    //verify borrower balance (-totalDebt)
    assert.isTrue(await utils.verifyBalance(weth, borrower, preWETHBalances[borrower], 0, totalDebt1.add(totalDebt2)))

    //verify lender balance (totalDebt-fee)
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], totalDebt1.add(totalDebt2), fee1.add(fee2)))

    //verify owner nft(borrower)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, borrower))
    assert.isTrue(await utils.verifyOwnerNft(testNft, 2, borrower))

    return assert.isTrue(true);
  });
});
