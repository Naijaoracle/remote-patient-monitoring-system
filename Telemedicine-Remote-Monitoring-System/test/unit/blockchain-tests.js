// Filepath: /test/unit/blockchain-tests.js

const assert = require('assert');
const BlockchainService = require('../../mobile-app/services/BlockchainService');

describe('BlockchainService', () => {
  it('should submit measurement data to the blockchain', async () => {
    const data = {
      deviceAddress: '0xDeviceAddress',
      centralDeviceAddress: '0xCentralDeviceAddress',
      timestampPeripheral: 1620000000,
      timestampCentral: 1620000001,
      measurementData: '0xSignedData'
    };
    const txHash = await BlockchainService.submitMeasurement(data);
    assert.ok(txHash, 'Transaction hash should be returned');
  });

  it('should retrieve measurement data from the blockchain', async () => {
    const txHash = '0xTransactionHash';
    const data = await BlockchainService.getMeasurement(txHash);
    assert.ok(data, 'Measurement data should be returned');
  });
});
