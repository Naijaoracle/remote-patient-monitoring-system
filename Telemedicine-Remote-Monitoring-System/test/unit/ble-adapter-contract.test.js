const SimulatedBleAdapter = require('../../mobile-app/services/adapters/SimulatedBleAdapter');
const BLEService = require('../../mobile-app/services/BLEService');
const { runBleAdapterContractSuite } = require('../helpers/ble-adapter-contract');

function createSimulatedAdapter() {
  return new SimulatedBleAdapter({
    buildPeripheralSignaturePayload: BLEService.buildPeripheralSignaturePayload,
    runChallengeHandshake: BLEService.runChallengeHandshake,
    isEvmAddress: BLEService.isEvmAddress,
    defaultCentralAddress: '0x000000000000000000000000000000000000C001',
  });
}

runBleAdapterContractSuite('SimulatedBleAdapter', createSimulatedAdapter);
