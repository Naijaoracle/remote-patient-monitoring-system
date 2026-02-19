// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ValidatorManager} from "../contracts/ValidatorManager.sol";

contract ValidatorActor {
    function proposeAdd(ValidatorManager manager, address validator) external returns (bytes32) {
        return manager.proposeAddValidator(validator);
    }

    function proposeRemove(ValidatorManager manager, address validator) external returns (bytes32) {
        return manager.proposeRemoveValidator(validator);
    }

    function approve(ValidatorManager manager, bytes32 proposalId) external {
        manager.approveProposal(proposalId);
    }
}

contract ValidatorManagerFoundryTest {
    function testQuorumAddAndRemoveFlow() public {
        ValidatorActor v1 = new ValidatorActor();
        ValidatorActor v2 = new ValidatorActor();
        ValidatorActor v3 = new ValidatorActor();
        ValidatorActor candidate = new ValidatorActor();

        address[] memory initial = new address[](3);
        initial[0] = address(v1);
        initial[1] = address(v2);
        initial[2] = address(v3);

        ValidatorManager manager = new ValidatorManager(initial);

        bytes32 addId = v1.proposeAdd(manager, address(candidate));
        require(!manager.isValidator(address(candidate)), "candidate should not be validator after first approval");
        v2.approve(manager, addId);
        require(manager.isValidator(address(candidate)), "candidate should be validator after quorum");

        bytes32 removeId = v1.proposeRemove(manager, address(candidate));
        require(manager.isValidator(address(candidate)), "candidate should remain validator pre-quorum removal");
        v2.approve(manager, removeId);
        require(manager.isValidator(address(candidate)), "candidate should remain validator after 2 approvals");
        v3.approve(manager, removeId);
        require(!manager.isValidator(address(candidate)), "candidate should be removed after quorum");
    }

    function testCannotRemoveLastValidator() public {
        ValidatorActor solo = new ValidatorActor();

        address[] memory initial = new address[](1);
        initial[0] = address(solo);

        ValidatorManager manager = new ValidatorManager(initial);

        (bool ok, bytes memory data) = address(solo).call(
            abi.encodeWithSelector(ValidatorActor.proposeRemove.selector, manager, address(solo))
        );

        require(!ok, "expected remove-last-validator to revert");
        require(_contains(data, "Cannot remove last validator"), "unexpected revert reason");
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
