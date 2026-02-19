const { expect } = require("chai");
const { ethers } = require("hardhat");

async function expectRevert(promise, expectedMessage) {
  try {
    await promise;
    expect.fail("Expected transaction to revert");
  } catch (error) {
    expect(error.message).to.include(expectedMessage);
  }
}

describe("Measurement (Hardhat)", function () {
  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [validator1, validator2, validator3, device, central, outsider] = signers;

    const ValidatorManager = await ethers.getContractFactory("ValidatorManager");
    const validatorManager = await ValidatorManager.deploy([
      validator1.address,
      validator2.address,
      validator3.address,
    ]);
    await validatorManager.waitForDeployment();

    const Measurement = await ethers.getContractFactory("Measurement");
    const measurement = await Measurement.deploy(await validatorManager.getAddress(), 15);
    await measurement.waitForDeployment();

    return { measurement, validator1, device, central, outsider };
  }

  it("allows validator to submit measurement hash", async function () {
    const { measurement, validator1, device, central } = await deployFixture();

    const measurementHash = ethers.keccak256(ethers.toUtf8Bytes("measurement-1"));
    const challengeHash = ethers.keccak256(ethers.toUtf8Bytes("challenge-1"));

    await (
      await measurement
        .connect(validator1)
        .submitMeasurementHash(
          measurementHash,
          device.address,
          central.address,
          1620000000,
          1620000005,
          challengeHash
        )
    ).wait();

    const stored = await measurement.getMeasurement(measurementHash);
    expect(stored.exists).to.equal(true);
    expect(stored.deviceAddress).to.equal(device.address);
    expect(stored.centralDeviceAddress).to.equal(central.address);
  });

  it("rejects non-validator submissions", async function () {
    const { measurement, outsider, device, central } = await deployFixture();

    await expectRevert(
      measurement
        .connect(outsider)
        .submitMeasurementHash(
          ethers.keccak256(ethers.toUtf8Bytes("m2")),
          device.address,
          central.address,
          1620000000,
          1620000005,
          ethers.keccak256(ethers.toUtf8Bytes("c2"))
        ),
      "Not a validator"
    );
  });
});
