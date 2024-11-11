// Filepath: /smart-contracts/test/Measurement.test.js

const Measurement = artifacts.require("Measurement");

contract("Measurement", (accounts) => {
  it("should emit MeasurementRecorded event", async () => {
    const measurementInstance = await Measurement.deployed();

    const tx = await measurementInstance.recordMeasurement(
      accounts[1], // centralDeviceAddress
      1620000000,  // timestampPeripheral
      1620000001,  // timestampCentral
      web3.utils.asciiToHex("HeartRate:75") // measurementData
    );

    const event = tx.logs[0];
    assert.equal(event.event, "MeasurementRecorded", "Event name mismatch");
    assert.equal(event.args.deviceAddress, accounts[0], "Device address mismatch");
    assert.equal(event.args.centralDeviceAddress, accounts[1], "Central device address mismatch");
  });
});
