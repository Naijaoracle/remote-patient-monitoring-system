// Filepath: /smart-contracts/contracts/Measurement.sol

pragma solidity ^0.8.0;

contract Measurement {
    event MeasurementRecorded(
        address indexed deviceAddress,
        address indexed centralDeviceAddress,
        uint256 timestampPeripheral,
        uint256 timestampCentral,
        bytes measurementData
    );

    function recordMeasurement(
        address centralDeviceAddress,
        uint256 timestampPeripheral,
        uint256 timestampCentral,
        bytes memory measurementData
    ) public {
        emit MeasurementRecorded(
            msg.sender,
            centralDeviceAddress,
            timestampPeripheral,
            timestampCentral,
            measurementData
        );
    }
}
