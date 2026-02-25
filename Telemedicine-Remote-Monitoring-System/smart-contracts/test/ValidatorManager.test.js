const ValidatorManager = artifacts.require("ValidatorManager");

const CANDIDATE_A = "0x00000000000000000000000000000000000000a3";
const CANDIDATE_B = "0x00000000000000000000000000000000000000a4";
const CANDIDATE_C = "0x00000000000000000000000000000000000000a5";
const CANDIDATE_D = "0x00000000000000000000000000000000000000a7";
const DEFAULT_FUNDER = "0xf3e63b5ad8ce0cc5e41d725a1a10d219681a5798";

contract("ValidatorManager", () => {
  let validatorManager;
  let initialValidators;
  let outsider;
  let funder;

  async function rpc(method, params = []) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method,
          params,
          id: Date.now(),
        },
        (err, res) => {
          if (err) {
            reject(err);
            return;
          }
          if (res && res.error) {
            reject(new Error(res.error.message || "RPC call failed"));
            return;
          }
          resolve(res.result);
        }
      );
    });
  }

  async function createUnlockedFundedAccount(valueEth = "1") {
    const password = "truffle-validator-test";
    const addr = await rpc("personal_newAccount", [password]);
    await rpc("personal_unlockAccount", [addr, password, 0]);
    await web3.eth.sendTransaction({
      from: funder,
      to: addr,
      value: web3.utils.toWei(valueEth, "ether"),
    });
    return addr;
  }

  beforeEach(async () => {
    funder = process.env.TRUFFLE_FROM || DEFAULT_FUNDER;
    const validator2 = await createUnlockedFundedAccount("1");
    const validator3 = await createUnlockedFundedAccount("1");
    initialValidators = [funder, validator2, validator3];
    validatorManager = await ValidatorManager.new(initialValidators, { from: funder });
    outsider = await createUnlockedFundedAccount("0.5");
  });

  it("should initialize with initial validators", async () => {
    const validators = await validatorManager.getValidators();
    assert.equal(validators.length, initialValidators.length, "Incorrect number of initial validators");
  });

  it("should reject invalid initial validator sets", async () => {
    try {
      await ValidatorManager.new([], { from: funder });
      assert.fail("Expected empty validator set to revert");
    } catch (error) {
      assert.include(error.message, "Insufficient initial validators", "Expected minimum validator protection");
    }

    try {
      await ValidatorManager.new([funder, initialValidators[1]], { from: funder });
      assert.fail("Expected too-small validator set to revert");
    } catch (error) {
      assert.include(error.message, "Insufficient initial validators", "Expected minimum validator protection");
    }

    try {
      await ValidatorManager.new([funder, initialValidators[1], "0x0000000000000000000000000000000000000000"], { from: funder });
      assert.fail("Expected zero address validator to revert");
    } catch (error) {
      assert.include(error.message, "Invalid validator", "Expected zero-address protection");
    }

    try {
      await ValidatorManager.new([funder, funder], { from: funder });
      assert.fail("Expected duplicate validator to revert");
    } catch (error) {
      assert.include(error.message, "Duplicate validator", "Expected duplicate-validator protection");
    }
  });

  it("should require quorum to add a new validator", async () => {
    const proposalTx = await validatorManager.proposeAddValidator(CANDIDATE_A, { from: initialValidators[0] });
    const proposalId = proposalTx.logs.find((log) => log.event === "ProposalCreated").args.proposalId;

    let isValidator = await validatorManager.isValidator(CANDIDATE_A);
    assert.isFalse(isValidator, "Validator should not be added with single approval");

    await validatorManager.approveProposal(proposalId, { from: initialValidators[1] });
    isValidator = await validatorManager.isValidator(CANDIDATE_A);
    assert.isTrue(isValidator, "Validator was not added after quorum approval");
  });

  it("should require quorum to remove a validator", async () => {
    const addTx = await validatorManager.proposeAddValidator(CANDIDATE_B, { from: initialValidators[0] });
    const addProposalId = addTx.logs.find((log) => log.event === "ProposalCreated").args.proposalId;
    await validatorManager.approveProposal(addProposalId, { from: initialValidators[1] });

    const removeTx = await validatorManager.proposeRemoveValidator(CANDIDATE_B, { from: initialValidators[0] });
    const removeProposalId = removeTx.logs.find((log) => log.event === "ProposalCreated").args.proposalId;

    let isValidator = await validatorManager.isValidator(CANDIDATE_B);
    assert.isTrue(isValidator, "Validator should still exist before quorum removal");

    await validatorManager.approveProposal(removeProposalId, { from: initialValidators[1] });
    await validatorManager.approveProposal(removeProposalId, { from: initialValidators[2] });
    isValidator = await validatorManager.isValidator(CANDIDATE_B);
    assert.isFalse(isValidator, "Validator was not removed after quorum approval");
  });

  it("should not allow a non-validator to create proposals", async () => {
    try {
      await validatorManager.proposeAddValidator(CANDIDATE_C, { from: outsider });
      assert.fail("Non-validator was able to propose validator changes");
    } catch (error) {
      assert.include(error.message, "Not a validator", "Expected 'Not a validator' error");
    }
  });

  it("should reject duplicate active proposals for the same action/target", async () => {
    await validatorManager.proposeAddValidator(CANDIDATE_D, { from: initialValidators[0] });
    try {
      await validatorManager.proposeAddValidator(CANDIDATE_D, { from: initialValidators[1] });
      assert.fail("Expected duplicate active proposal to revert");
    } catch (error) {
      assert.include(error.message, "Proposal already active", "Expected active-proposal dedupe");
    }
  });

  it("should not allow removing the last validator", async () => {
    const minimalValidatorManager = await ValidatorManager.new(initialValidators, { from: funder });
    try {
      await minimalValidatorManager.proposeRemoveValidator(funder, { from: funder });
      assert.fail("Should not allow dropping below minimum validators");
    } catch (error) {
      assert.include(error.message, "Cannot go below minimum validators", "Expected minimum-validator protection");
    }
  });
});
