// Filepath: /test/unit/ble-tests.js

const assert = require('assert');
const BLEService = require('../../mobile-app/services/BLEService');

describe('BLEService', () => {
  it('should scan for devices and return a list', async () => {
    const devices = await BLEService.scanForDevices();
    assert(Array.isArray(devices), 'Devices should be an array');
  });

  it('should connect to a BLE device', async () => {
    const result = await BLEService.connectToDevice('Device123');
    assert.strictEqual(result, true, 'Should return true on successful connection');
  });
});
