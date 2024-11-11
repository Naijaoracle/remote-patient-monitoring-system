// Filepath: /smart-contracts/test/ValidatorManager.test.js

const ValidatorManager = artifacts.require("ValidatorManager");

contract("ValidatorManager", (accounts) => {
  let validatorManager;

  before(async () => {
    validatorManager = await ValidatorManager.deployed();
  });

  it("should initialize with initial validators", async () => {
    const validators = await validatorManager.getValidators();
    assert.equal(validators.length, 3, "Incorrect number of initial validators");
  });

  it("should allow a validator to add a new validator", async () => {
    await validatorManager.addValidator(accounts[3], { from: accounts[0] });
    const isValidator = await validatorManager.isValidator(accounts[3]);
    assert.isTrue(isValidator, "Validator was not added");
  });

  it("should allow a validator to remove a validator", async () => {
    await validatorManager.removeValidator(accounts[3], { from: accounts[0] });
    const isValidator = await validatorManager.isValidator(accounts[3]);
    assert.isFalse(isValidator, "Validator was not removed");
  });

  it("should not allow a non-validator to add a validator", async () => {
    try {
      await validatorManager.addValidator(accounts[4], { from: accounts[5] });
      assert.fail("Non-validator was able to add a validator");
    } catch (error) {
      assert.include(error.message, "Not a validator", "Expected 'Not a validator' error");
    }
  });
});
