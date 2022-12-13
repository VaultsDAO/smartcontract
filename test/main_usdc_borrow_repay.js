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
    let preBalances = {}
    let testAddress = [lender, borrower, bidder1, bidder2, shopFactory.address, platformFeeReceiver]

    rs = await shopFactory.shops('1')

    await shopFactory.setShopConfigurations(
      [
        {
          reserveAddress: usdc.address,
          nftAddress: testNft.address,
          interestRate: 1000,
          ltvRate: 4000,
          active: true
        }
      ],
      { from: lender }
    )


    //=== faucet asset
    await usdc.mint(bidder1, web3.utils.toWei('1000', 'mwei'), { from: bidder1 })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: bidder1 })

    await usdc.mint(bidder2, web3.utils.toWei('1000', 'mwei'), { from: bidder2 })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: bidder2 })

    await usdc.mint(lender, web3.utils.toWei('1000', 'mwei'), { from: lender })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: lender })

    await usdc.mint(borrower, web3.utils.toWei('1000', 'mwei'), { from: borrower })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: borrower })

    await testNft.mint(borrower, '1', { from: borrower });
    await testNft.mint(borrower, '2', { from: borrower });

    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)

    //========================borrow USDC
    let borrowAmount1 = new BN(10000000)//10
    let borrowAmount2 = new BN(20000000)//20

    await testNft.setApprovalForAll(shopFactory.address, true, { from: borrower });

    rs = await shopFactory.batchBorrow(
      '1',
      [usdc.address, usdc.address],
      [borrowAmount1, borrowAmount2],
      [testNft.address, testNft.address],
      ['1', '2'],
      borrower,
      { from: borrower }
    );

    let logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Borrow')
    let loanId1 = logs[0].loanId
    let loanId2 = logs[1].loanId

    //verify borrower balance (borrowAmount1 + borrowAmount2)
    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], borrowAmount1.add(borrowAmount2), 0))

    //verify lender balance ( -(borrowAmount1 + borrowAmount2))
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], 0, borrowAmount1.add(borrowAmount2)))

    //verify owner nft (bnft)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, bnft.address))
    assert.isTrue(await utils.verifyOwnerNft(testNft, 2, bnft.address))

    //=======================repay loan1
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)

    //getNftDebtData
    rs = await shopLoan.getNftDebtData(
      loanId1,
      { from: borrower }
    );

    let totalDebt = rs.totalDebt
    //repay 50%
    let repayAmount = new BN(totalDebt / 2)
    rs = await shopFactory.repay(
      loanId1,
      repayAmount,
      { from: borrower }
    );
    let fee = rs.logs[0].args.feeAmount
    //verify loan status (Active)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Active))

    //verify borrower balance (-repayAmount)
    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], 0, repayAmount))

    //verify lender balance (repayAmount-fee)
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], repayAmount, fee))

    //repay full
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)

    //getNftDebtData
    rs = await shopLoan.getNftDebtData(
      loanId1,
      { from: borrower }
    );

    repayAmount = rs.totalDebt
    rs = await shopFactory.repay(
      loanId1,
      repayAmount,
      { from: borrower }
    );
    fee = rs.logs[0].args.feeAmount
    //verify loan status (Repaid)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Repaid))

    //verify borrower balance (-repayAmount)
    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], 0, repayAmount))

    //verify lender balance (repayAmount-fee)
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], repayAmount, fee))

    //verify owner nft(borrower)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, borrower))

    //=======================repay loan2
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)
    //getNftDebtData
    rs = await shopLoan.getNftDebtData(
      loanId2,
      { from: borrower }
    );

    totalDebt = rs.totalDebt
    rs = await shopFactory.repay(
      loanId2,
      totalDebt,
      { from: borrower }
    );
    fee = rs.logs[0].args.feeAmount
    //check loan status (Repaid)

    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId2, utils.LoanState.Repaid))
    //verify borrower balance (-totalDebt)
    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], 0, totalDebt))

    //verify lender balance (totalDebt-fee)
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], totalDebt, fee))

    //verify owner nft
    assert.isTrue(await utils.verifyOwnerNft(testNft, 2, borrower))

    return assert.isTrue(true);
  });
});
