const Measurement = artifacts.require("Measurement");
const ValidatorManager = artifacts.require("ValidatorManager");

const DEVICE_A = "0x00000000000000000000000000000000000000a1";
const DEVICE_B = "0x00000000000000000000000000000000000000a2";
const DEVICE_C = "0x00000000000000000000000000000000000000a3";
const CENTRAL_A = "0x00000000000000000000000000000000000000c1";
const CENTRAL_B = "0x00000000000000000000000000000000000000c2";
const DEFAULT_FUNDER = "0xf3e63b5ad8ce0cc5e41d725a1a10d219681a5798";

contract("Measurement", () => {
  let measurementInstance;
  let ownerValidator;
  let outsider;

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

  async function createUnlockedAccount(funder, valueEth = "1") {
    const password = "truffle-measurement-test";
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
    ownerValidator = process.env.TRUFFLE_FROM || DEFAULT_FUNDER;
    const validatorManager = await ValidatorManager.new([ownerValidator], { from: ownerValidator });
    measurementInstance = await Measurement.new(validatorManager.address, 15, { from: ownerValidator });
    outsider = await createUnlockedAccount(ownerValidator, "0.5");
  });

  it("should record a measurement hash from a validator", async () => {
    const measurementHash = web3.utils.soliditySha3("measurement-1");
    const challengeHash = web3.utils.soliditySha3("challenge-1");

    const tx = await measurementInstance.submitMeasurementHash(
      measurementHash,
      DEVICE_A,
      CENTRAL_A,
      1620000000,
      1620000005,
      challengeHash,
      { from: ownerValidator }
    );

    const event = tx.logs[0];
    assert.equal(event.event, "MeasurementHashRecorded", "Event name mismatch");
    assert.equal(event.args.deviceAddress.toLowerCase(), DEVICE_A.toLowerCase(), "Device address mismatch");
    assert.equal(
      event.args.centralDeviceAddress.toLowerCase(),
      CENTRAL_A.toLowerCase(),
      "Central device address mismatch"
    );
  });

  it("should reject replayed challenge hash", async () => {
    const challengeHash = web3.utils.soliditySha3("challenge-replay");

    await measurementInstance.submitMeasurementHash(
      web3.utils.soliditySha3("measurement-replay-1"),
      DEVICE_B,
      CENTRAL_A,
      1620000100,
      1620000104,
      challengeHash,
      { from: ownerValidator }
    );

    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-replay-2"),
        DEVICE_B,
        CENTRAL_A,
        1620000110,
        1620000114,
        challengeHash,
        { from: ownerValidator }
      );
      assert.fail("Replay challenge should have reverted");
    } catch (error) {
      assert.include(error.message, "Challenge already used", "Expected challenge replay revert");
    }
  });

  it("should reject zero challenge hash", async () => {
    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-zero-challenge"),
        DEVICE_B,
        CENTRAL_A,
        1620000200,
        1620000205,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        { from: ownerValidator }
      );
      assert.fail("Expected zero challenge hash to revert");
    } catch (error) {
      assert.include(error.message, "Invalid challenge hash", "Expected zero-challenge protection");
    }
  });

  it("should reject non-monotonic peripheral timestamp per device", async () => {
    await measurementInstance.submitMeasurementHash(
      web3.utils.soliditySha3("measurement-monotonic-1"),
      DEVICE_C,
      CENTRAL_A,
      1620000300,
      1620000304,
      web3.utils.soliditySha3("challenge-monotonic-1"),
      { from: ownerValidator }
    );

    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-monotonic-2"),
        DEVICE_C,
        CENTRAL_A,
        1620000299,
        1620000305,
        web3.utils.soliditySha3("challenge-monotonic-2"),
        { from: ownerValidator }
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
    await measurementInstance.revokePeripheralKey(DEVICE_A, { from: ownerValidator });

    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-revoked-peripheral"),
        DEVICE_A,
        CENTRAL_A,
        1620000400,
        1620000405,
        web3.utils.soliditySha3("challenge-revoked-peripheral"),
        { from: ownerValidator }
      );
      assert.fail("Expected revoked peripheral key submission to revert");
    } catch (error) {
      assert.include(error.message, "Peripheral key revoked", "Expected revoked peripheral protection");
    }

    await measurementInstance.unrevokePeripheralKey(DEVICE_A, { from: ownerValidator });
  });

  it("should reject submissions from revoked central keys", async () => {
    await measurementInstance.revokeCentralKey(CENTRAL_B, { from: ownerValidator });

    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-revoked-central"),
        DEVICE_B,
        CENTRAL_B,
        1620000500,
        1620000505,
        web3.utils.soliditySha3("challenge-revoked-central"),
        { from: ownerValidator }
      );
      assert.fail("Expected revoked central key submission to revert");
    } catch (error) {
      assert.include(error.message, "Central key revoked", "Expected revoked central protection");
    }

    await measurementInstance.unrevokeCentralKey(CENTRAL_B, { from: ownerValidator });
  });

  it("should allow only owner to manage revocations", async () => {
    try {
      await measurementInstance.revokePeripheralKey(DEVICE_A, { from: outsider });
      assert.fail("Non-owner was able to revoke key");
    } catch (error) {
      assert.include(error.message, "Not owner", "Expected owner-only revocation");
    }
  });

  it("should allow small peripheral-ahead clock skew", async () => {
    const tx = await measurementInstance.submitMeasurementHash(
      web3.utils.soliditySha3("measurement-clock-skew-small"),
      DEVICE_A,
      CENTRAL_A,
      1620000608,
      1620000600,
      web3.utils.soliditySha3("challenge-clock-skew-small"),
      { from: ownerValidator }
    );
    assert.equal(tx.receipt.status, true, "Expected accepted submission with small clock skew");
  });

  it("should reject excessive peripheral-ahead clock skew", async () => {
    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-clock-skew-large"),
        DEVICE_B,
        CENTRAL_A,
        1620000700,
        1620000600,
        web3.utils.soliditySha3("challenge-clock-skew-large"),
        { from: ownerValidator }
      );
      assert.fail("Expected excessive peripheral clock skew to revert");
    } catch (error) {
      assert.include(error.message, "Central timestamp before peripheral", "Expected clock-skew guard");
    }
  });

  it("should reject submissions while paused", async () => {
    await measurementInstance.pause({ from: ownerValidator });
    try {
      await measurementInstance.submitMeasurementHash(
        web3.utils.soliditySha3("measurement-paused"),
        DEVICE_A,
        CENTRAL_A,
        1620000600,
        1620000605,
        web3.utils.soliditySha3("challenge-paused"),
        { from: ownerValidator }
      );
      assert.fail("Expected paused contract to reject submission");
    } catch (error) {
      assert.include(error.message, "Paused", "Expected paused guard");
    }
    await measurementInstance.unpause({ from: ownerValidator });
  });
});
