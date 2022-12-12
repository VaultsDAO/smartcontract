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
    let punkGateway = deployment.punkGateway
    let cPunk = deployment.cPunk
    let wPunk = deployment.wPunk
    let wPunkBnft = deployment.wPunkBnft

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
          nftAddress: wPunk.address,
          interestRate: 1000,
          ltvRate: 4000,
          active: true
        }
      ],
      { from: lender }
    )

    //faucet
    await weth.deposit({ value: web3.utils.toWei('3', 'ether'), from: lender })
    await weth.approve(shopFactory.address, web3.utils.toWei('1000', 'ether'), { from: lender })

    await cPunk.getPunk('1', { from: borrower });
    await cPunk.getPunk('2', { from: borrower });

    await cPunk.offerPunkForSaleToAddress('1', '0', punkGateway.address, { from: borrower });
    await cPunk.offerPunkForSaleToAddress('2', '0', punkGateway.address, { from: borrower });

    //========================borrow ETH

    await wPunk.setApprovalForAll(punkGateway.address, true, { from: borrower });

    let borrowAmount1 = new BN(web3.utils.toWei('0.01', 'ether'))
    let borrowAmount2 = new BN(web3.utils.toWei('0.02', 'ether'))

    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)

    rs = await punkGateway.batchBorrowETH(
      '1',
      [borrowAmount1, borrowAmount2],
      ['1', '2'],
      borrower,
      { from: borrower }
    );
    let gasCost = await utils.gasCost(rs);
    let logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Borrow')
    let loanId1 = logs[0].loanId
    let loanId2 = logs[1].loanId

    //verify borrower balance (borrowAmount1 + borrowAmount2 - gasUsed)
    // assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], borrowAmount1.add(borrowAmount2), gasCost))
    //verify lender balance ( -(borrowAmount1 + borrowAmount2))
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], 0, borrowAmount1.add(borrowAmount2)))

    //verify owner nft (wPunkBnft)
    assert.isTrue(await utils.verifyOwnerNft(wPunk, 1, wPunkBnft.address))
    assert.isTrue(await utils.verifyOwnerNft(wPunk, 2, wPunkBnft.address))

    //========================repay ETH
    //loan1
    //partial repay

    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    rs = await shopFactory.getNftDebtData(
      loanId1,
      { from: borrower }
    );

    let repayAmount = (new BN(rs.totalDebt.toString())).div(new BN(2))

    rs = await punkGateway.repayETH(
      loanId1,
      repayAmount,
      { value: repayAmount, from: borrower }
    );
    gasCost = await utils.gasCost(rs);
    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Repay')
    let fee = logs[0].feeAmount

    //verify borrower balance (-(repayAmount + gasCost))
    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], 0, gasCost.add(repayAmount)))

    //verify lender balance (repayAmount-fee)
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], repayAmount, fee))

    //verify owner nft(bnft)
    assert.isTrue(await utils.verifyOwnerNft(wPunk, 1, wPunkBnft.address))

    //repay full
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    rs = await shopFactory.getNftDebtData(
      loanId1,
      { from: borrower }
    );

    repayAmount = new BN(rs.totalDebt.toString())

    rs = await punkGateway.repayETH(
      loanId1,
      repayAmount,
      { value: repayAmount, from: borrower }
    );
    gasCost = await utils.gasCost(rs);
    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Repay')
    fee = logs[0].feeAmount

    //verify loan status (Repaid)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Repaid))

    //verify borrower balance (-(repayAmount + gasCost))
    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], 0, gasCost.add(repayAmount)))

    //verify lender balance (repayAmount-fee)
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], repayAmount, fee))

    //verify owner nft(borrower)
    assert.isTrue(await utils.verifyOwnerPunk(cPunk, 1, borrower))


    //loan2
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    rs = await shopFactory.getNftDebtData(
      loanId2,
      { from: borrower }
    );

    totalDebt = rs.totalDebt

    rs = await punkGateway.repayETH(
      loanId2,
      totalDebt,
      { value: totalDebt, from: borrower }
    );
    gasCost = await utils.gasCost(rs);
    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Repay')
    fee = logs[0].feeAmount

    //verify loan status (Repaid)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId2, utils.LoanState.Repaid))

    //verify borrower balance (-(totalDebt + gasCost))
    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], 0, gasCost.add(totalDebt)))

    //verify lender balance (totalDebt-fee)
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], totalDebt, fee))

    //verify owner nft(borrower)
    assert.isTrue(await utils.verifyOwnerPunk(cPunk, 2, borrower))

    return assert.isTrue(true);
  });
});
