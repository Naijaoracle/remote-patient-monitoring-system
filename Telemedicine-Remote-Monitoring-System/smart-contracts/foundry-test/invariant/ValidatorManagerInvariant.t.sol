// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ValidatorManager} from "../../contracts/ValidatorManager.sol";

contract ValidatorManagerHandler is Test {
    ValidatorManager public manager;
    address[] public candidatePool;
    bytes32[] public proposalIds;

    constructor(ValidatorManager _manager, address[] memory _candidatePool) {
        manager = _manager;
        candidatePool = _candidatePool;
    }

    function proposalCount() external view returns (uint256) {
        return proposalIds.length;
    }

    function driveAdd(uint256 candidateSeed) external {
        address candidate = candidatePool[candidateSeed % candidatePool.length];
        if (manager.isValidator(candidate)) {
            return;
        }

        address[] memory currentValidators = manager.getValidators();
        vm.prank(currentValidators[0]);
        bytes32 proposalId = manager.proposeAddValidator(candidate);
        proposalIds.push(proposalId);

        uint256 approvalsNeeded = manager.quorum() - 1;
        for (uint256 i = 0; i < approvalsNeeded && (i + 1) < currentValidators.length; i++) {
            vm.prank(currentValidators[i + 1]);
            manager.approveProposal(proposalId);
        }
    }

    function driveRemove(uint256 validatorSeed) external {
        address[] memory currentValidators = manager.getValidators();
        if (currentValidators.length <= 1) {
            return;
        }

        address target = currentValidators[validatorSeed % currentValidators.length];

        vm.prank(currentValidators[0]);
        bytes32 proposalId = manager.proposeRemoveValidator(target);
        proposalIds.push(proposalId);

        uint256 approvalsNeeded = manager.quorum() - 1;
        for (uint256 i = 0; i < approvalsNeeded && (i + 1) < currentValidators.length; i++) {
            vm.prank(currentValidators[i + 1]);
            manager.approveProposal(proposalId);
        }
    }
}

contract ValidatorManagerInvariantTest is StdInvariant, Test {
    ValidatorManager internal manager;
    ValidatorManagerHandler internal handler;
    mapping(bytes32 => uint256) private lastObservedApprovals;

    function setUp() public {
        address[] memory initialValidators = new address[](3);
        initialValidators[0] = makeAddr("validator1");
        initialValidators[1] = makeAddr("validator2");
        initialValidators[2] = makeAddr("validator3");

        manager = new ValidatorManager(initialValidators);

        address[] memory candidatePool = new address[](7);
        candidatePool[0] = makeAddr("validator4");
        candidatePool[1] = makeAddr("validator5");
        candidatePool[2] = makeAddr("validator6");
        candidatePool[3] = makeAddr("validator7");
        candidatePool[4] = makeAddr("validator8");
        candidatePool[5] = makeAddr("validator9");
        candidatePool[6] = makeAddr("validator10");

        handler = new ValidatorManagerHandler(manager, candidatePool);
        targetContract(address(handler));
    }

    function invariant_ValidatorArrayMatchesMapping() public view {
        address[] memory validators = manager.getValidators();
        require(validators.length > 0, "validator set should never be empty");

        for (uint256 i = 0; i < validators.length; i++) {
            require(manager.isValidator(validators[i]), "array entry missing from mapping");
            for (uint256 j = i + 1; j < validators.length; j++) {
                require(validators[i] != validators[j], "duplicate validator in array");
            }
        }
    }

    function invariant_QuorumFormulaAlwaysHolds() public view {
        address[] memory validators = manager.getValidators();
        uint256 expected = (validators.length / 2) + 1;
        require(manager.quorum() == expected, "quorum formula mismatch");
    }

    function invariant_ProposalApprovalsAreMonotonic() public {
        uint256 count = handler.proposalCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 proposalId = handler.proposalIds(i);
            (, , , , uint256 approvals) = manager.getProposal(proposalId);
            require(
                approvals >= lastObservedApprovals[proposalId],
                "proposal approvals should never decrease"
            );
            lastObservedApprovals[proposalId] = approvals;
        }
    }

    function invariant_ExecutedProposalsCannotBeReExecutedOrApproved() public {
        uint256 count = handler.proposalCount();
        address[] memory validators = manager.getValidators();
        if (validators.length == 0) {
            return;
        }

        for (uint256 i = 0; i < count; i++) {
            bytes32 proposalId = handler.proposalIds(i);
            (, bool executed, , , ) = manager.getProposal(proposalId);
            if (!executed) {
                continue;
            }

            vm.startPrank(validators[0]);
            (bool approveOk, bytes memory approveData) = address(manager).call(
                abi.encodeWithSelector(ValidatorManager.approveProposal.selector, proposalId)
            );
            (bool executeOk, bytes memory executeData) = address(manager).call(
                abi.encodeWithSelector(ValidatorManager.executeProposal.selector, proposalId)
            );
            vm.stopPrank();

            require(!approveOk, "executed proposal should not accept approval");
            require(!executeOk, "executed proposal should not execute again");
            require(_contains(approveData, "Proposal already executed"), "unexpected approve revert");
            require(_contains(executeData, "Proposal already executed"), "unexpected execute revert");
        }
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
