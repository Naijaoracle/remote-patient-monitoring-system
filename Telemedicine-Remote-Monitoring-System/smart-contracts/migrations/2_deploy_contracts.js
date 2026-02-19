// Filepath: /smart-contracts/migrations/2_deploy_contracts.js

const Measurement = artifacts.require("Measurement");
const ValidatorManager = artifacts.require("ValidatorManager");

module.exports = async function (deployer, network, accounts) {
  const initialValidators = accounts.slice(0, 3); // First three accounts as validators
  await deployer.deploy(ValidatorManager, initialValidators);
  const validatorManager = await ValidatorManager.deployed();
  await deployer.deploy(Measurement, validatorManager.address, 15);
};
