// Filepath: /test/integration/end-to-end-test.js

const assert = require('assert');
const BLEService = require('../../mobile-app/services/BLEService');
const BlockchainService = require('../../mobile-app/services/BlockchainService');

describe('End-to-End Test', () => {
  it('should process data from device to blockchain successfully', async () => {
    // Simulate device scanning and connection
    await BLEService.scanForDevices();
    await BLEService.connectToDevice('Device123');

    // Simulate receiving measurement
    const measurement = await BLEService.receiveMeasurement();

    // Submit measurement to blockchain
    const txHash = await BlockchainService.submitMeasurement(measurement);

    // Retrieve measurement from blockchain
    const retrievedData = await BlockchainService.getMeasurement(txHash);

    // Validate data integrity
    assert.deepStrictEqual(measurement, retrievedData, 'Data should match');
  });
});
