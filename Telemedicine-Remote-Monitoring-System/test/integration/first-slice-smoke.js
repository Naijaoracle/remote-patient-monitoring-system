const assert = require('assert');

const BLEService = require('../../shared/runtime/services/BLEService');
const BlockchainService = require('../../shared/runtime/services/BlockchainService');
const CryptoUtils = require('../../shared/runtime/utils/CryptoUtils');

async function run() {
  BLEService.resetForTests();
  BlockchainService.resetForTests();

  const peripheral = CryptoUtils.generateKeyPair();
  const central = CryptoUtils.generateKeyPair();

  const deviceAddress = '0x0000000000000000000000000000000000000101';
  const centralDeviceAddress = '0x0000000000000000000000000000000000000201';
  const validatorAddress = '0x0000000000000000000000000000000000000301';

  BLEService.registerDevice({
    deviceAddress,
    privateKeyPem: peripheral.privateKey,
    publicKeyPem: peripheral.publicKey,
    measurementFactory: () => ({ type: 'glucose', value: 98, unit: 'mg/dL' }),
  });

  BlockchainService.registerPeripheralKey(deviceAddress, peripheral.publicKey);
  BlockchainService.registerCentralKey(centralDeviceAddress, central.publicKey);
  BlockchainService.addValidator(validatorAddress);

  const discovered = await BLEService.scanForDevices();
  assert.strictEqual(discovered.includes(deviceAddress), true, 'Device should be discoverable');

  const connected = await BLEService.connectToDevice(deviceAddress);
  assert.strictEqual(connected, true, 'Device connection should succeed');

  const peripheralMeasurement = await BLEService.receiveMeasurement({
    deviceAddress,
    centralDeviceAddress,
  });

  const timestampCentral = Math.floor(Date.now() / 1000);
  const centralPayload = {
    ...peripheralMeasurement,
    timestampCentral,
  };

  const centralSignature = CryptoUtils.signData(
    BlockchainService.buildCentralSignaturePayload(centralPayload),
    central.privateKey
  );

  const fullMeasurement = {
    ...centralPayload,
    centralSignature,
  };

  const txHash = await BlockchainService.submitMeasurement(fullMeasurement, { validatorAddress });
  assert.ok(txHash.startsWith('0x'), 'Transaction hash should be hex-prefixed');

  const stored = await BlockchainService.getMeasurement(txHash);
  assert.deepStrictEqual(stored.measurementData, { type: 'glucose', value: 98, unit: 'mg/dL' });
  assert.strictEqual(stored.validatedBy, validatorAddress);

  let replayError = null;
  try {
    await BlockchainService.submitMeasurement(fullMeasurement, { validatorAddress });
  } catch (error) {
    replayError = error;
  }

  assert.ok(replayError, 'Replay attempt should fail');
  assert.ok(/Replay detected/.test(replayError.message), 'Replay error reason should be explicit');

  console.log('PASS first-slice-smoke');
}

run().catch((error) => {
  console.error('FAIL first-slice-smoke');
  console.error(error);
  process.exitCode = 1;
});
