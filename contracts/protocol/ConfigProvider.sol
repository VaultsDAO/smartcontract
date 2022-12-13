// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {OwnableUpgradeable} from "../openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Errors} from "../libraries/helpers/Errors.sol";

contract ConfigProvider is OwnableUpgradeable {
    /// @notice nft oracle
    address public nftOracle;
    /// @notice reserve oracle
    address public reserveOracle;
    /// @notice bnft registry
    address public bnftRegistry;
    /// @notice user claim registry
    address public userClaimRegistry;
    /// @notice shop loans
    address public shopFactory;
    /// @notice shop loans
    address public loanManager;
    /// @notice loanMaxDuration
    uint256 public loanMaxDuration; // not use
    /// @notice feePercentage
    uint256 public platformFeePercentage;
    /// @notice feeReceiver
    address public platformFeeReceiver;
    /// @notice auctionDuration
    uint256 public auctionDuration;
    uint256 public minBidDeltaPercentage;
    uint256 public minBidFine;
    uint256 public redeemFine;
    uint256 public redeemDuration;
    uint256 public liquidationThreshold;
    uint256 public liquidationBonus;
    uint256 public redeemThreshold;
    uint256 public maxLoanDuration;
    uint256 public interestDuration;
    uint256 public auctionFeePercentage;
    uint256 public rebuyDuration;
    uint256 public rebuyFeePercentage;
    uint256 public minDustAmount;

    /// @notice for gap, minus 1 if use
    uint256[22] public __number;
    address[25] public __gapAddress;

    //event
    event AuctionDurationSet(uint256 _value);
    event PlatformFeePercentageSet(uint256 _value);
    event PlatformFeeReceiverSet(address _value);
    event MaxLoanDurationSet(uint256 _maxDay);
    event RedeemThresholdSet(uint256 _threshold);
    event LiquidationThresholdSet(uint256 _threshold);
    event LiquidationBonusSet(uint256 _bonus);
    event MinBidFineSet(uint256 _minBidFine);
    event RedeemFineSet(uint256 _redeemFine);
    event RedeemDurationSet(uint256 _redeemDuration);
    event LoanMaxDurationSet(uint256 _loanMaxDuration);
    event InterestDurationSet(uint256 _interestDuration);
    event NftOracleSet(address _nftOracle);
    event ReserveOracleSet(address _reserveOracle);
    event UserClaimRegistrySet(address _userClaimRegistry);
    event ShopFactorySet(address _shopFactory);
    event LoanManagerSet(address _loanManager);
    event MinBidDeltaPercentageSet(uint256 _minBidDeltaPercentage);
    event AuctionFeePercentageSet(uint256 _auctionFeePercentage);
    event RebuyDurationSet(uint256 _rebuyDuration);
    event RebuyFeePercentageSet(uint256 _rebuyFeePercentage);
    event MinDustAmountSet(uint256 _minDustAmount);

    //end event

    function initialize() external initializer {
        __Ownable_init();
        //
        loanMaxDuration = 365 days;
        platformFeePercentage = 100; // 1%
        platformFeeReceiver = msg.sender;
        auctionDuration = 4 hours;
        minBidDeltaPercentage = 100; // 0.1 ETH
        minBidFine = 2000; //~ 0.2 ETH
        redeemFine = 500; //5%
        redeemDuration = 4 hours; //24hour
        liquidationThreshold = 8000; //80%
        liquidationBonus = 2000; //20%
        redeemThreshold = 5000; //50%
        maxLoanDuration = 365 days;
        interestDuration = 1 hours;
        auctionFeePercentage = 250; //2.5%
        rebuyDuration = 2 hours;
        rebuyFeePercentage = 500; //5%
        minDustAmount = 1 * 10 ** 14;
    }

    function setMinDustAmount(uint256 _value) external onlyOwner {
        minDustAmount = _value;
        emit MinDustAmountSet(_value);
    }

    function setRebuyFeePercentage(uint256 _value) external onlyOwner {
        rebuyFeePercentage = _value;
        emit RebuyFeePercentageSet(_value);
    }

    function setAuctionFeePercentage(uint256 _value) external onlyOwner {
        auctionFeePercentage = _value;
        emit AuctionFeePercentageSet(_value);
    }

    function setRebuyDuration(uint256 _value) external onlyOwner {
        rebuyDuration = _value;
        emit RebuyDurationSet(_value);
    }

    function setAuctionDuration(uint256 _value) external onlyOwner {
        require(_value >= redeemDuration, Errors.RC_INVALID_AUCTION_DURATION);
        auctionDuration = _value;
        emit AuctionDurationSet(_value);
    }

    function setPlatformFeePercentage(uint256 _value) external onlyOwner {
        platformFeePercentage = _value;
        emit PlatformFeePercentageSet(_value);
    }

    function setPlatformFeeReceiver(address _value) external onlyOwner {
        platformFeeReceiver = _value;
        emit PlatformFeeReceiverSet(_value);
    }

    function setMaxLoanDuration(uint256 _value) external onlyOwner {
        maxLoanDuration = _value;
        emit MaxLoanDurationSet(_value);
    }

    function setRedeemThreshold(uint256 _value) external onlyOwner {
        redeemThreshold = _value;
        emit RedeemThresholdSet(_value);
    }

    function setLiquidationThreshold(uint256 _value) external onlyOwner {
        liquidationThreshold = _value;
        emit LiquidationThresholdSet(_value);
    }

    function setLiquidationBonus(uint256 _bonus) external onlyOwner {
        liquidationBonus = _bonus;
        emit LiquidationBonusSet(_bonus);
    }

    function setMinBidFine(uint256 _value) external onlyOwner {
        minBidFine = _value;
        emit MinBidFineSet(_value);
    }

    function setRedeemFine(uint256 _value) external onlyOwner {
        redeemFine = _value;
        emit RedeemFineSet(_value);
    }

    function setRedeemDuration(uint256 _value) external onlyOwner {
        require(_value <= auctionDuration, Errors.RC_INVALID_REDEEM_DURATION);
        redeemDuration = _value;
        emit RedeemDurationSet(_value);
    }

    function setMinBidDeltaPercentage(uint256 _value) external onlyOwner {
        minBidDeltaPercentage = _value;
        emit MinBidDeltaPercentageSet(_value);
    }

    function setInterestDuration(uint256 _value) external onlyOwner {
        require(_value > 0, "cannot go to 0 value");
        interestDuration = _value;
        emit InterestDurationSet(_value);
    }

    function setNftOracle(address _nftOracle) external onlyOwner {
        require(_nftOracle != address(0), "cannot go to 0 address");
        nftOracle = _nftOracle;
        emit NftOracleSet(_nftOracle);
    }

    function setReserveOracle(address _reserveOracle) external onlyOwner {
        require(_reserveOracle != address(0), "cannot go to 0 address");
        reserveOracle = _reserveOracle;
        emit ReserveOracleSet(_reserveOracle);
    }

    function setBnftRegistry(address _bnftRegistry) external onlyOwner {
        require(_bnftRegistry != address(0), "cannot go to 0 address");
        bnftRegistry = _bnftRegistry;
    }

    function setUserClaimRegistry(
        address _userClaimRegistry
    ) external onlyOwner {
        require(_userClaimRegistry != address(0), "cannot go to 0 address");
        userClaimRegistry = _userClaimRegistry;
        emit UserClaimRegistrySet(_userClaimRegistry);
    }

    function setShopFactory(address _shopFactory) external onlyOwner {
        require(_shopFactory != address(0), "cannot go to 0 address");
        shopFactory = _shopFactory;
        emit ShopFactorySet(_shopFactory);
    }

    function setLoanManager(address _loanManager) external onlyOwner {
        require(_loanManager != address(0), "cannot go to 0 address");
        loanManager = _loanManager;
        emit LoanManagerSet(_loanManager);
    }
}
