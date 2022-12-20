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

    //setup loan duration = 1 seconds
    await provider.setMaxLoanDuration(1);
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
    await wPunk.setApprovalForAll(punkGateway.address, true, { from: lender });

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

    //verify borrower balance (borrowAmount1 + borrowAmount2 - gasUsed)
    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], borrowAmount1.add(borrowAmount2), gasCost))
    //verify lender balance ( -(borrowAmount1 + borrowAmount2))
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], 0, borrowAmount1.add(borrowAmount2)))

    //verify owner nft (bnft)
    assert.isTrue(await utils.verifyOwnerNft(wPunk, 1, wPunkBnft.address))
    assert.isTrue(await utils.verifyOwnerNft(wPunk, 2, wPunkBnft.address))

    rs = await shopLoan.getNftLiquidatePrice(
      loanId1,
      { from: borrower }
    );

    let bidPrice = rs.liquidatePrice

    //======================= auction
    await utils.waitAndEvmMine(2000);
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    //bidder1
    rs = await shopLoan.getNftLiquidatePrice(
      loanId1,
      { from: borrower }
    );

    bidPrice = rs.liquidatePrice
    rs = await punkGateway.auctionETH(
      loanId1,
      bidder1,
      { value: bidPrice, from: bidder1 }
    );
    gasCost = await utils.gasCost(rs);
    //verify loan status (auction)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Auction))
    //verify bidder balance (-(bidPrice + gasCost))
    assert.isTrue(await utils.verifyETHBalance(bidder1, preETHBalances[bidder1], 0, bidPrice.add(gasCost)))
    //verify shopFactory balance (+bidPrice)
    assert.isTrue(await utils.verifyBalance(weth, shopFactory.address, preWETHBalances[shopFactory.address], bidPrice, 0));

    //bibder2
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    //getNftAuctionData
    rs = await shopLoan.getNftAuctionData(
      loanId1,
      { from: bidder2 }
    );
    let lastBid = rs.bidPrice;
    bidPrice = rs.bidBorrowAmount.mul(new BN(110)).div(new BN(10000)).add(lastBid) //1.1%
    rs = await punkGateway.auctionETH(
      loanId1,
      bidder2,
      { value: bidPrice, from: bidder2 }
    );
    gasCost = await utils.gasCost(rs);
    //verify bidder1 balance (+lastBid) ETH
    assert.isTrue(await utils.verifyETHBalance(bidder1, preETHBalances[bidder1], lastBid, 0))

    //verify bidder2 balance (-(bidPrice + gasCost))
    assert.isTrue(await utils.verifyETHBalance(bidder2, preETHBalances[bidder2], 0, bidPrice.add(gasCost)))

    //verify shopFactory balance (+bidPrice -lastBid) WETH
    assert.isTrue(await utils.verifyBalance(weth, shopFactory.address, preWETHBalances[shopFactory.address], bidPrice, lastBid));

    //============================= rebuy 
    await provider.setRebuyDuration(100);// 100s
    await utils.waitAndEvmMine(1000);
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    await provider.setRedeemDuration(0);
    await provider.setAuctionDuration(0);


    rs = await shopLoan.getRebuyAmount(
      loanId1,
      { from: lender }
    );
    let rebuyAmount = rs.rebuyAmount
    let payAmount = rs.payAmount

    rs = await punkGateway.rebuyETH(
      loanId1, rebuyAmount,
      { value: payAmount, from: lender }
    );
    gasCost = await utils.gasCost(rs);

    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Rebuy')
    let remainAmount = logs[0].remainAmount
    let feeAmount = logs[0].feeAmount
    let auctionFeeAmount = logs[0].auctionFeeAmount
    //check loan status (Defaulted)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Defaulted))

    //verify owner nft (lender)
    assert.isTrue(await utils.verifyOwnerPunk(cPunk, 1, lender))

    //verify lender balance ( - payAmount - gas)
    assert.isTrue(await utils.verifyETHBalance(lender, preETHBalances[lender], 0, payAmount.add(gasCost)))

    //verify bidder2 balance ( +rebuyAmount)
    assert.isTrue(await utils.verifyETHBalance(bidder2, preETHBalances[bidder2], rebuyAmount, 0))

    //verify borrower balance (+remainAmount)
    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], remainAmount, 0))

    //verify platformfee balance (+feeAmount + auction fee)
    assert.isTrue(await utils.verifyBalance(weth, platformFeeReceiver, preWETHBalances[platformFeeReceiver], feeAmount.add(auctionFeeAmount), 0))

    return assert.isTrue(true);

  });
});
