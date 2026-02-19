const { ethers } = require("hardhat");

async function main() {
  const [deployer, validator2, validator3] = await ethers.getSigners();

  const ValidatorManager = await ethers.getContractFactory("ValidatorManager");
  const validatorManager = await ValidatorManager.deploy([
    deployer.address,
    validator2.address,
    validator3.address,
  ]);
  await validatorManager.waitForDeployment();

  const Measurement = await ethers.getContractFactory("Measurement");
  const measurement = await Measurement.deploy(
    await validatorManager.getAddress(),
    15
  );
  await measurement.waitForDeployment();

  console.log("ValidatorManager:", await validatorManager.getAddress());
  console.log("Measurement:", await measurement.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
