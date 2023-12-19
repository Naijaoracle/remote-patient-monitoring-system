//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MeasurementContract {
    address public owner; // Owner of the contract
    mapping(address => bool) public validators; // Mapping of validators
    event MeasurementReceived(address indexed sender, string measurement);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only contract owner can call this function");
        _;
    }

    modifier onlyValidator() {
        require(validators[msg.sender], "Only validators can call this function");
        _;
    }

    function addValidator(address _validator) external onlyOwner {
        validators[_validator] = true;
    }

    function removeValidator(address _validator) external onlyOwner {
        delete validators[_validator];
    }

    function receiveMeasurement(string memory _measurement) external {
        // This function can be called by the smartphone when it receives a signed measurement from the peripheral device
        emit MeasurementReceived(msg.sender, _measurement);
        sendMeasurementToValidators(_measurement);
    }

    function sendMeasurementToValidators(string memory _measurement) internal onlyValidator {
        // Function to send the received measurement to the validators
        // Will implement the logic to handle measurement validation or other processes here
        // Let's emit an event indicating measurement sent to validators
        emit MeasurementSentToValidators(_measurement);
    }

    event MeasurementSentToValidators(string measurement);
}
