// Filepath: /smart-contracts/contracts/ValidatorManager.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract ValidatorManager {
    enum ProposalType {
        Add,
        Remove
    }

    struct Proposal {
        bool exists;
        bool executed;
        ProposalType proposalType;
        address target;
        uint256 approvals;
    }

    address[] public validators;
    mapping(address => bool) public isValidator;
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => mapping(address => bool)) public hasApproved;
    mapping(bytes32 => bool) public activeProposalByKey;
    uint256 public proposalNonce;

    event ValidatorAdded(address validator);
    event ValidatorRemoved(address validator);
    event ProposalCreated(bytes32 indexed proposalId, uint8 proposalType, address indexed target, address proposer);
    event ProposalApproved(bytes32 indexed proposalId, address indexed approver, uint256 approvals, uint256 quorum);
    event ProposalExecuted(bytes32 indexed proposalId, address indexed executor);

    constructor(address[] memory initialValidators) {
        require(initialValidators.length > 0, "No initial validators");
        for (uint256 i = 0; i < initialValidators.length; i++) {
            address validator = initialValidators[i];
            require(validator != address(0), "Invalid validator");
            require(!isValidator[validator], "Duplicate validator");
            validators.push(validator);
            isValidator[validator] = true;
        }
    }

    modifier onlyValidator() {
        require(isValidator[msg.sender], "Not a validator");
        _;
    }

    function quorum() public view returns (uint256) {
        return (validators.length / 2) + 1;
    }

    function proposeAddValidator(address validator) public onlyValidator returns (bytes32) {
        return _createProposal(ProposalType.Add, validator);
    }

    function proposeRemoveValidator(address validator) public onlyValidator returns (bytes32) {
        require(validators.length > 1, "Cannot remove last validator");
        return _createProposal(ProposalType.Remove, validator);
    }

    function approveProposal(bytes32 proposalId) public onlyValidator {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.exists, "Unknown proposal");
        require(!proposal.executed, "Proposal already executed");
        require(!hasApproved[proposalId][msg.sender], "Already approved");

        hasApproved[proposalId][msg.sender] = true;
        proposal.approvals += 1;
        emit ProposalApproved(proposalId, msg.sender, proposal.approvals, quorum());

        if (proposal.approvals >= quorum()) {
            _executeProposal(proposalId);
        }
    }

    function executeProposal(bytes32 proposalId) public onlyValidator {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.exists, "Unknown proposal");
        require(!proposal.executed, "Proposal already executed");
        require(proposal.approvals >= quorum(), "Insufficient approvals");
        _executeProposal(proposalId);
    }

    function getProposal(bytes32 proposalId)
        public
        view
        returns (
            bool exists,
            bool executed,
            uint8 proposalType,
            address target,
            uint256 approvals
        )
    {
        Proposal memory proposal = proposals[proposalId];
        return (
            proposal.exists,
            proposal.executed,
            uint8(proposal.proposalType),
            proposal.target,
            proposal.approvals
        );
    }

    function _createProposal(ProposalType proposalType, address target) internal returns (bytes32) {
        require(target != address(0), "Invalid validator");
        if (proposalType == ProposalType.Add) {
            require(!isValidator[target], "Already a validator");
        } else {
            require(isValidator[target], "Not a validator");
        }

        bytes32 proposalKey = keccak256(abi.encode(uint8(proposalType), target));
        require(!activeProposalByKey[proposalKey], "Proposal already active");

        proposalNonce += 1;
        bytes32 proposalId = keccak256(
            abi.encode(address(this), proposalNonce, uint8(proposalType), target)
        );
        proposals[proposalId] = Proposal({
            exists: true,
            executed: false,
            proposalType: proposalType,
            target: target,
            approvals: 0
        });
        activeProposalByKey[proposalKey] = true;

        emit ProposalCreated(proposalId, uint8(proposalType), target, msg.sender);
        approveProposal(proposalId);
        return proposalId;
    }

    function _executeProposal(bytes32 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;
        bytes32 proposalKey = keccak256(abi.encode(uint8(proposal.proposalType), proposal.target));
        activeProposalByKey[proposalKey] = false;

        if (proposal.proposalType == ProposalType.Add) {
            require(!isValidator[proposal.target], "Already a validator");
            validators.push(proposal.target);
            isValidator[proposal.target] = true;
            emit ValidatorAdded(proposal.target);
        } else {
            require(isValidator[proposal.target], "Not a validator");
            require(validators.length > 1, "Cannot remove last validator");
            isValidator[proposal.target] = false;
            emit ValidatorRemoved(proposal.target);

            // Remove validator from the array.
            for (uint256 i = 0; i < validators.length; i++) {
                if (validators[i] == proposal.target) {
                    validators[i] = validators[validators.length - 1];
                    validators.pop();
                    break;
                }
            }
        }

        emit ProposalExecuted(proposalId, msg.sender);
    }

    function getValidators() public view returns (address[] memory) {
        return validators;
    }
}
