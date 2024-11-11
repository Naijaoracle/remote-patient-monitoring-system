// Filepath: /smart-contracts/contracts/ValidatorManager.sol

pragma solidity ^0.8.0;

contract ValidatorManager {
    address[] public validators;
    mapping(address => bool) public isValidator;

    event ValidatorAdded(address validator);
    event ValidatorRemoved(address validator);

    constructor(address[] memory initialValidators) {
        for (uint256 i = 0; i < initialValidators.length; i++) {
            address validator = initialValidators[i];
            validators.push(validator);
            isValidator[validator] = true;
        }
    }

    modifier onlyValidator() {
        require(isValidator[msg.sender], "Not a validator");
        _;
    }

    function addValidator(address validator) public onlyValidator {
        require(!isValidator[validator], "Already a validator");
        validators.push(validator);
        isValidator[validator] = true;
        emit ValidatorAdded(validator);
    }

    function removeValidator(address validator) public onlyValidator {
        require(isValidator[validator], "Not a validator");
        isValidator[validator] = false;
        emit ValidatorRemoved(validator);

        // Remove validator from the array
        for (uint256 i = 0; i < validators.length; i++) {
            if (validators[i] == validator) {
                validators[i] = validators[validators.length - 1];
                validators.pop();
                break;
            }
        }
    }

    function getValidators() public view returns (address[] memory) {
        return validators;
    }
}
