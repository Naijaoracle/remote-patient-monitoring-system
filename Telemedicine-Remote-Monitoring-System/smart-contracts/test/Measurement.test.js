// Filepath: /smart-contracts/test/Measurement.test.js

const Measurement = artifacts.require("Measurement");

contract("Measurement", (accounts) => {
  it("should record a measurement hash from a validator", async () => {
    const measurementInstance = await Measurement.deployed();
    const measurementHash = web3.utils.soliditySha3("measurement-1");
    const challengeHash = web3.utils.soliditySha3("challenge-1");

    const tx = await measurementInstance.submitMeasurementHash(
      measurementHash,
      accounts[2], // deviceAddress
      accounts[1], // centralDeviceAddress
      1620000000,  // timestampPeripheral
      1620000005,  // timestampCentral
      challengeHash,
      { from: accounts[0] }
    );

    const event = tx.logs[0];
    assert.equal(event.event, "MeasurementHashRecorded", "Event name mismatch");
    assert.equal(event.args.deviceAddress, accounts[2], "Device address mismatch");
    assert.equal(event.args.centralDeviceAddress, accounts[1], "Central device address mismatch");
  });

  it("should reject replayed challenge hash", async () => {
    const measurementInstance = await Measurement.deployed();
    const challengeHash = web3.utils.soliditySha3("challenge-replay");

    await measurementInstance.submitMeasurementHash(
      web3.utils.soliditySha3("measurement-replay-1"),
      accounts[2],
      accounts[1],
      1620000100,
      1620000104,
      challengeHash,
      { from: accounts[0] }
    );

    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-replay-2"),
        accounts[2],
        accounts[1],
        1620000110,
        1620000114,
        challengeHash,
        { from: accounts[0] }
      );
      assert.fail("Replay challenge should have reverted");
    } catch (error) {
      assert.include(error.message, "Challenge already used", "Expected challenge replay revert");
    }
  });

  it("should reject zero challenge hash", async () => {
    const measurementInstance = await Measurement.deployed();
    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-zero-challenge"),
        accounts[2],
        accounts[1],
        1620000200,
        1620000205,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        { from: accounts[0] }
      );
      assert.fail("Expected zero challenge hash to revert");
    } catch (error) {
      assert.include(error.message, "Invalid challenge hash", "Expected zero-challenge protection");
    }
  });

  it("should reject non-monotonic peripheral timestamp per device", async () => {
    const measurementInstance = await Measurement.deployed();

    await measurementInstance.submitMeasurementHash(
      web3.utils.soliditySha3("measurement-monotonic-1"),
      accounts[4],
      accounts[1],
      1620000300,
      1620000304,
      web3.utils.soliditySha3("challenge-monotonic-1"),
      { from: accounts[0] }
    );

    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-monotonic-2"),
        accounts[4],
        accounts[1],
        1620000299,
        1620000305,
        web3.utils.soliditySha3("challenge-monotonic-2"),
        { from: accounts[0] }
      );
      assert.fail("Expected non-monotonic timestamp to revert");
    } catch (error) {
      assert.include(
        error.message,
        "Non-monotonic peripheral timestamp",
        "Expected monotonic-timestamp protection"
      );
    }
  });

  it("should reject submissions from revoked peripheral keys", async () => {
    const measurementInstance = await Measurement.deployed();
    await measurementInstance.revokePeripheralKey(accounts[6], { from: accounts[0] });

    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-revoked-peripheral"),
        accounts[6],
        accounts[1],
        1620000400,
        1620000405,
        web3.utils.soliditySha3("challenge-revoked-peripheral"),
        { from: accounts[0] }
      );
      assert.fail("Expected revoked peripheral key submission to revert");
    } catch (error) {
      assert.include(error.message, "Peripheral key revoked", "Expected revoked peripheral protection");
    }

    await measurementInstance.unrevokePeripheralKey(accounts[6], { from: accounts[0] });
  });

  it("should reject submissions from revoked central keys", async () => {
    const measurementInstance = await Measurement.deployed();
    await measurementInstance.revokeCentralKey(accounts[7], { from: accounts[0] });

    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-revoked-central"),
        accounts[2],
        accounts[7],
        1620000500,
        1620000505,
        web3.utils.soliditySha3("challenge-revoked-central"),
        { from: accounts[0] }
      );
      assert.fail("Expected revoked central key submission to revert");
    } catch (error) {
      assert.include(error.message, "Central key revoked", "Expected revoked central protection");
    }

    await measurementInstance.unrevokeCentralKey(accounts[7], { from: accounts[0] });
  });

  it("should allow only owner to manage revocations", async () => {
    const measurementInstance = await Measurement.deployed();

    try {
      await measurementInstance.revokePeripheralKey(accounts[5], { from: accounts[1] });
      assert.fail("Non-owner was able to revoke key");
    } catch (error) {
      assert.include(error.message, "Not owner", "Expected owner-only revocation");
    }
  });
});
