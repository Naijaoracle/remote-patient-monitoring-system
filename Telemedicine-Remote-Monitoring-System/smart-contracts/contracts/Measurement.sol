// Filepath: /smart-contracts/contracts/Measurement.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IValidatorManager {
    function isValidator(address validator) external view returns (bool);
}

contract Measurement {
    struct StoredMeasurement {
        address deviceAddress;
        address centralDeviceAddress;
        uint256 timestampPeripheral;
        uint256 timestampCentral;
        bytes32 challengeHash;
        address validatedBy;
        uint256 validatedAt;
        bool exists;
    }

    IValidatorManager public validatorManager;
    uint256 public proximityWindowSeconds;
    address public owner;

    mapping(bytes32 => StoredMeasurement) public measurements;
    mapping(bytes32 => bool) public usedChallenges;
    mapping(address => uint256) public latestPeripheralTimestamp;
    mapping(address => bool) public revokedPeripheralKeys;
    mapping(address => bool) public revokedCentralKeys;

    event MeasurementHashRecorded(
        bytes32 indexed measurementHash,
        address indexed deviceAddress,
        address indexed centralDeviceAddress,
        address validator,
        uint256 timestampPeripheral,
        uint256 timestampCentral,
        bytes32 challengeHash
    );
    event PeripheralKeyRevoked(address indexed deviceAddress);
    event PeripheralKeyUnrevoked(address indexed deviceAddress);
    event CentralKeyRevoked(address indexed centralDeviceAddress);
    event CentralKeyUnrevoked(address indexed centralDeviceAddress);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address validatorManagerAddress, uint256 proximityWindow) {
        require(validatorManagerAddress != address(0), "Invalid validator manager");
        require(proximityWindow > 0, "Invalid proximity window");
        validatorManager = IValidatorManager(validatorManagerAddress);
        proximityWindowSeconds = proximityWindow;
        owner = msg.sender;
    }

    modifier onlyValidator() {
        require(validatorManager.isValidator(msg.sender), "Not a validator");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function revokePeripheralKey(address deviceAddress) external onlyOwner {
        require(deviceAddress != address(0), "Invalid device address");
        revokedPeripheralKeys[deviceAddress] = true;
        emit PeripheralKeyRevoked(deviceAddress);
    }

    function unrevokePeripheralKey(address deviceAddress) external onlyOwner {
        require(deviceAddress != address(0), "Invalid device address");
        revokedPeripheralKeys[deviceAddress] = false;
        emit PeripheralKeyUnrevoked(deviceAddress);
    }

    function revokeCentralKey(address centralDeviceAddress) external onlyOwner {
        require(centralDeviceAddress != address(0), "Invalid central device address");
        revokedCentralKeys[centralDeviceAddress] = true;
        emit CentralKeyRevoked(centralDeviceAddress);
    }

    function unrevokeCentralKey(address centralDeviceAddress) external onlyOwner {
        require(centralDeviceAddress != address(0), "Invalid central device address");
        revokedCentralKeys[centralDeviceAddress] = false;
        emit CentralKeyUnrevoked(centralDeviceAddress);
    }

    function submitMeasurementHash(
        bytes32 measurementHash,
        address deviceAddress,
        address centralDeviceAddress,
        uint256 timestampPeripheral,
        uint256 timestampCentral,
        bytes32 challengeHash
    ) external onlyValidator {
        require(measurementHash != bytes32(0), "Invalid measurement hash");
        require(challengeHash != bytes32(0), "Invalid challenge hash");
        require(deviceAddress != address(0), "Invalid device address");
        require(centralDeviceAddress != address(0), "Invalid central device address");
        require(!revokedPeripheralKeys[deviceAddress], "Peripheral key revoked");
        require(!revokedCentralKeys[centralDeviceAddress], "Central key revoked");
        require(
            timestampPeripheral > latestPeripheralTimestamp[deviceAddress],
            "Non-monotonic peripheral timestamp"
        );
        require(timestampCentral >= timestampPeripheral, "Central timestamp before peripheral");
        require(timestampCentral - timestampPeripheral <= proximityWindowSeconds, "Proximity window exceeded");
        require(!usedChallenges[challengeHash], "Challenge already used");
        require(!measurements[measurementHash].exists, "Measurement already recorded");

        usedChallenges[challengeHash] = true;
        latestPeripheralTimestamp[deviceAddress] = timestampPeripheral;
        measurements[measurementHash] = StoredMeasurement({
            deviceAddress: deviceAddress,
            centralDeviceAddress: centralDeviceAddress,
            timestampPeripheral: timestampPeripheral,
            timestampCentral: timestampCentral,
            challengeHash: challengeHash,
            validatedBy: msg.sender,
            validatedAt: block.timestamp,
            exists: true
        });

        emit MeasurementHashRecorded(
            measurementHash,
            deviceAddress,
            centralDeviceAddress,
            msg.sender,
            timestampPeripheral,
            timestampCentral,
            challengeHash
        );
    }

    function getMeasurement(bytes32 measurementHash)
        external
        view
        returns (
            address deviceAddress,
            address centralDeviceAddress,
            uint256 timestampPeripheral,
            uint256 timestampCentral,
            bytes32 challengeHash,
            address validatedBy,
            uint256 validatedAt,
            bool exists
        )
    {
        StoredMeasurement memory measurement = measurements[measurementHash];
        return (
            measurement.deviceAddress,
            measurement.centralDeviceAddress,
            measurement.timestampPeripheral,
            measurement.timestampCentral,
            measurement.challengeHash,
            measurement.validatedBy,
            measurement.validatedAt,
            measurement.exists
        );
    }
}
