// Filepath: /smart-contracts/test/ValidatorManager.test.js

const ValidatorManager = artifacts.require("ValidatorManager");

contract("ValidatorManager", (accounts) => {
  let validatorManager;

  beforeEach(async () => {
    validatorManager = await ValidatorManager.new(accounts.slice(0, 3));
  });

  it("should initialize with initial validators", async () => {
    const validators = await validatorManager.getValidators();
    assert.equal(validators.length, 3, "Incorrect number of initial validators");
  });

  it("should reject invalid initial validator sets", async () => {
    try {
      await ValidatorManager.new([]);
      assert.fail("Expected empty validator set to revert");
    } catch (error) {
      assert.include(error.message, "No initial validators", "Expected empty-set protection");
    }

    try {
      await ValidatorManager.new([accounts[0], "0x0000000000000000000000000000000000000000"]);
      assert.fail("Expected zero address validator to revert");
    } catch (error) {
      assert.include(error.message, "Invalid validator", "Expected zero-address protection");
    }

    try {
      await ValidatorManager.new([accounts[0], accounts[0]]);
      assert.fail("Expected duplicate validator to revert");
    } catch (error) {
      assert.include(error.message, "Duplicate validator", "Expected duplicate-validator protection");
    }
  });

  it("should require quorum to add a new validator", async () => {
    const proposalTx = await validatorManager.proposeAddValidator(accounts[3], { from: accounts[0] });
    const proposalId = proposalTx.logs.find((log) => log.event === "ProposalCreated").args.proposalId;

    let isValidator = await validatorManager.isValidator(accounts[3]);
    assert.isFalse(isValidator, "Validator should not be added with single approval");

    await validatorManager.approveProposal(proposalId, { from: accounts[1] });
    isValidator = await validatorManager.isValidator(accounts[3]);
    assert.isTrue(isValidator, "Validator was not added after quorum approval");
  });

  it("should require quorum to remove a validator", async () => {
    const addTx = await validatorManager.proposeAddValidator(accounts[4], { from: accounts[0] });
    const addProposalId = addTx.logs.find((log) => log.event === "ProposalCreated").args.proposalId;
    await validatorManager.approveProposal(addProposalId, { from: accounts[1] });

    const removeTx = await validatorManager.proposeRemoveValidator(accounts[4], { from: accounts[0] });
    const removeProposalId = removeTx.logs.find((log) => log.event === "ProposalCreated").args.proposalId;

    let isValidator = await validatorManager.isValidator(accounts[4]);
    assert.isTrue(isValidator, "Validator should still exist before quorum removal");

    await validatorManager.approveProposal(removeProposalId, { from: accounts[1] });
    await validatorManager.approveProposal(removeProposalId, { from: accounts[2] });
    isValidator = await validatorManager.isValidator(accounts[4]);
    assert.isFalse(isValidator, "Validator was not removed after quorum approval");
  });

  it("should not allow a non-validator to create proposals", async () => {
    try {
      await validatorManager.proposeAddValidator(accounts[5], { from: accounts[6] });
      assert.fail("Non-validator was able to propose validator changes");
    } catch (error) {
      assert.include(error.message, "Not a validator", "Expected 'Not a validator' error");
    }
  });

  it("should reject duplicate active proposals for the same action/target", async () => {
    await validatorManager.proposeAddValidator(accounts[7], { from: accounts[0] });
    try {
      await validatorManager.proposeAddValidator(accounts[7], { from: accounts[1] });
      assert.fail("Expected duplicate active proposal to revert");
    } catch (error) {
      assert.include(error.message, "Proposal already active", "Expected active-proposal dedupe");
    }
  });

  it("should not allow removing the last validator", async () => {
    const singleValidatorManager = await ValidatorManager.new([accounts[0]]);
    try {
      await singleValidatorManager.proposeRemoveValidator(accounts[0], { from: accounts[0] });
      assert.fail("Should not allow removing the last validator");
    } catch (error) {
      assert.include(error.message, "Cannot remove last validator", "Expected last-validator protection");
    }
  });
});
