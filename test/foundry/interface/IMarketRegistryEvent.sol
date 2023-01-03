pragma solidity 0.7.6;

interface IMarketRegistryEvent {
    event ClearingHouseChanged(address indexed clearingHouse);
    event PoolAdded(address indexed baseToken, uint24 indexed feeRatio, address indexed pool);
    event FeeRatioChanged(address baseToken, uint24 feeRatio);
    event InsuranceFundFeeRatioChanged(address baseToken, uint24 feeRatio);
    event MaxOrdersPerMarketChanged(uint8 maxOrdersPerMarket);
}
