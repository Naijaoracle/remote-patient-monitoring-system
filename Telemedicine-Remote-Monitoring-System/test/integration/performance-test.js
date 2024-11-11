// Filepath: /test/integration/performance-test.js

const assert = require('assert');
const BlockchainService = require('../../mobile-app/services/BlockchainService');

describe('Performance Test', () => {
  it('should handle multiple transactions efficiently', async function () {
    this.timeout(10000); // Extend timeout for performance test

    const transactions = [];
    const numTransactions = 100;

    for (let i = 0; i < numTransactions; i++) {
      const data = {
        deviceAddress: `0xDeviceAddress${i}`,
        centralDeviceAddress: `0xCentralDeviceAddress${i}`,
        timestampPeripheral: 1620000000 + i,
        timestampCentral: 1620000001 + i,
        measurementData: `0xSignedData${i}`
      };
      const txHash = await BlockchainService.submitMeasurement(data);
      transactions.push(txHash);
    }

    assert.strictEqual(transactions.length, numTransactions, 'All transactions should be processed');
  });
});
