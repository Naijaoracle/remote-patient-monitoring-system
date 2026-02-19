// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Measurement} from "../contracts/Measurement.sol";
import {ValidatorManager} from "../contracts/ValidatorManager.sol";

contract MeasurementActor {
    function submit(
        Measurement measurement,
        bytes32 measurementHash,
        address device,
        address central,
        uint256 timestampPeripheral,
        uint256 timestampCentral,
        bytes32 challengeHash
    ) external {
        measurement.submitMeasurementHash(
            measurementHash,
            device,
            central,
            timestampPeripheral,
            timestampCentral,
            challengeHash
        );
    }
}

contract MeasurementFoundryTest {
    function testValidatorCanSubmitMeasurementHash() public {
        MeasurementActor validator = new MeasurementActor();
        MeasurementActor validator2 = new MeasurementActor();
        MeasurementActor validator3 = new MeasurementActor();

        address[] memory initial = new address[](3);
        initial[0] = address(validator);
        initial[1] = address(validator2);
        initial[2] = address(validator3);

        ValidatorManager manager = new ValidatorManager(initial);
        Measurement measurement = new Measurement(address(manager), 15);

        bytes32 mHash = keccak256("measurement-1");
        bytes32 cHash = keccak256("challenge-1");

        validator.submit(
            measurement,
            mHash,
            address(0x1001),
            address(0x2001),
            1_620_000_000,
            1_620_000_005,
            cHash
        );

        (
            address deviceAddress,
            address centralAddress,
            uint256 timestampPeripheral,
            uint256 timestampCentral,
            bytes32 challengeHash,
            ,
            ,
            bool exists
        ) = measurement.getMeasurement(mHash);

        require(exists, "measurement should exist");
        require(deviceAddress == address(0x1001), "device address mismatch");
        require(centralAddress == address(0x2001), "central address mismatch");
        require(timestampPeripheral == 1_620_000_000, "peripheral timestamp mismatch");
        require(timestampCentral == 1_620_000_005, "central timestamp mismatch");
        require(challengeHash == cHash, "challenge hash mismatch");
    }

    function testRejectsNonValidatorSubmission() public {
        MeasurementActor validator = new MeasurementActor();
        MeasurementActor validator2 = new MeasurementActor();
        MeasurementActor validator3 = new MeasurementActor();
        MeasurementActor outsider = new MeasurementActor();

        address[] memory initial = new address[](3);
        initial[0] = address(validator);
        initial[1] = address(validator2);
        initial[2] = address(validator3);

        ValidatorManager manager = new ValidatorManager(initial);
        Measurement measurement = new Measurement(address(manager), 15);

        (bool ok, bytes memory data) = address(outsider).call(
            abi.encodeWithSelector(
                MeasurementActor.submit.selector,
                measurement,
                keccak256("measurement-2"),
                address(0x1002),
                address(0x2002),
                1_620_000_000,
                1_620_000_005,
                keccak256("challenge-2")
            )
        );

        require(!ok, "expected non-validator submission to revert");
        require(_contains(data, "Not a validator"), "unexpected revert reason");
    }

    function _contains(bytes memory data, string memory needle) internal pure returns (bool) {
        bytes memory haystack = data;
        bytes memory n = bytes(needle);

        if (n.length == 0 || haystack.length < n.length) {
            return false;
        }

        for (uint256 i = 0; i <= haystack.length - n.length; i++) {
            bool matchFound = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (haystack[i + j] != n[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) {
                return true;
            }
        }

        return false;
    }
}
