// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Measurement} from "../../contracts/Measurement.sol";
import {ValidatorManager} from "../../contracts/ValidatorManager.sol";

contract MeasurementHandler is Test {
    Measurement public measurement;
    ValidatorManager public manager;

    address[] public validators;
    address public outsider;

    bytes32[] public successfulMeasurementHashes;
    bytes32[] public successfulChallengeHashes;

    constructor(
        Measurement _measurement,
        ValidatorManager _manager,
        address[] memory _validators,
        address _outsider
    ) {
        measurement = _measurement;
        manager = _manager;
        validators = _validators;
        outsider = _outsider;
    }

    function successfulMeasurementHashesCount() external view returns (uint256) {
        return successfulMeasurementHashes.length;
    }

    function successfulChallengeHashesCount() external view returns (uint256) {
        return successfulChallengeHashes.length;
    }

    function submitValid(uint256 challengeSeed, uint256 timestampSeed) external {
        bytes32 challengeHash = keccak256(abi.encodePacked("valid", challengeSeed));
        bytes32 measurementHash = keccak256(abi.encodePacked("measurement", challengeSeed, timestampSeed));

        uint256 timestampPeripheral = 1_700_000_000 + (timestampSeed % 1000);
        uint256 timestampCentral = timestampPeripheral + (timestampSeed % 15);

        address validator = validators[challengeSeed % validators.length];
        vm.prank(validator);
        measurement.submitMeasurementHash(
            measurementHash,
            address(uint160(uint256(keccak256(abi.encodePacked(challengeSeed, "device"))))),
            address(uint160(uint256(keccak256(abi.encodePacked(challengeSeed, "central"))))),
            timestampPeripheral,
            timestampCentral,
            challengeHash
        );

        successfulMeasurementHashes.push(measurementHash);
        successfulChallengeHashes.push(challengeHash);
    }

    function submitReplayOrInvalid(uint256 seed) external {
        bytes32 challengeHash;
        if (successfulChallengeHashes.length > 0 && seed % 2 == 0) {
            challengeHash = successfulChallengeHashes[seed % successfulChallengeHashes.length];
        } else {
            challengeHash = keccak256(abi.encodePacked("invalid", seed));
        }

        bytes32 measurementHash = keccak256(abi.encodePacked("invalid-measurement", seed));
        uint256 timestampPeripheral = 1_700_000_000 + (seed % 1000);
        uint256 timestampCentral = timestampPeripheral + 20; // over proximity window

        address sender = seed % 3 == 0 ? outsider : validators[seed % validators.length];

        vm.startPrank(sender);
        (bool ok, ) = address(measurement).call(
            abi.encodeWithSelector(
                Measurement.submitMeasurementHash.selector,
                measurementHash,
                address(uint160(uint256(keccak256(abi.encodePacked(seed, "d"))))),
                address(uint160(uint256(keccak256(abi.encodePacked(seed, "c"))))),
                timestampPeripheral,
                timestampCentral,
                challengeHash
            )
        );
        vm.stopPrank();

        require(!ok, "invalid or replay submission should fail");
    }
}

contract MeasurementInvariantTest is StdInvariant, Test {
    ValidatorManager internal manager;
    Measurement internal measurement;
    MeasurementHandler internal handler;
    mapping(bytes32 => bool) private observedUsedChallenge;

    function setUp() public {
        address[] memory initialValidators = new address[](3);
        initialValidators[0] = makeAddr("validator1");
        initialValidators[1] = makeAddr("validator2");
        initialValidators[2] = makeAddr("validator3");

        manager = new ValidatorManager(initialValidators);
        measurement = new Measurement(address(manager), 15);

        handler = new MeasurementHandler(
            measurement,
            manager,
            initialValidators,
            makeAddr("outsider")
        );

        targetContract(address(handler));
    }

    function invariant_SuccessfulChallengesAreMarkedUsed() public view {
        uint256 count = handler.successfulChallengeHashesCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 challengeHash = handler.successfulChallengeHashes(i);
            require(measurement.usedChallenges(challengeHash), "successful challenge must be marked used");
        }
    }

    function invariant_SuccessfulMeasurementsExistAndRespectWindow() public view {
        uint256 count = handler.successfulMeasurementHashesCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 measurementHash = handler.successfulMeasurementHashes(i);
            (
                ,
                ,
                uint256 timestampPeripheral,
                uint256 timestampCentral,
                ,
                ,
                ,
                bool exists
            ) = measurement.getMeasurement(measurementHash);

            require(exists, "successful measurement hash should exist");
            require(
                timestampCentral >= timestampPeripheral && (timestampCentral - timestampPeripheral) <= 15,
                "stored measurement violates proximity window"
            );
        }
    }

    function invariant_UsedChallengeNeverBecomesUnused() public {
        uint256 count = handler.successfulChallengeHashesCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 challengeHash = handler.successfulChallengeHashes(i);
            bool currentlyUsed = measurement.usedChallenges(challengeHash);
            if (observedUsedChallenge[challengeHash]) {
                require(currentlyUsed, "used challenge reverted to unused");
            }
            if (currentlyUsed) {
                observedUsedChallenge[challengeHash] = true;
            }
        }
    }
}
