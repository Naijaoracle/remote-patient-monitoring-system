// Filepath: /smart-contracts/migrations/2_deploy_contracts.js

const Measurement = artifacts.require("Measurement");
const ValidatorManager = artifacts.require("ValidatorManager");

module.exports = async function (deployer, network, accounts) {
  const envValidators = String(process.env.INITIAL_VALIDATORS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const initialValidators = envValidators.length > 0 ? envValidators : accounts.slice(0, 3);
  if (initialValidators.length === 0) {
    throw new Error('No initial validators available for deployment');
  }
  await deployer.deploy(ValidatorManager, initialValidators);
  const validatorManager = await ValidatorManager.deployed();
  await deployer.deploy(Measurement, validatorManager.address, 15);
};
