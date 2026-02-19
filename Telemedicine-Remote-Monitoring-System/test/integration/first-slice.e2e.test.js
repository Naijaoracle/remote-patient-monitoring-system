const test = require('node:test');
const assert = require('node:assert/strict');

const BLEService = require('../../mobile-app/services/BLEService');
const BlockchainService = require('../../mobile-app/services/BlockchainService');
const CryptoUtils = require('../../mobile-app/utils/CryptoUtils');

test('First slice end-to-end: BLE to validator-anchored record', async () => {
  BLEService.resetForTests();
  BlockchainService.resetForTests();

  const peripheral = CryptoUtils.generateKeyPair();
  const central = CryptoUtils.generateKeyPair();

  const deviceAddress = '0x0000000000000000000000000000000000000E21';
  const centralDeviceAddress = '0x0000000000000000000000000000000000000C21';
  const validatorAddress = '0x0000000000000000000000000000000000000A21';

  BLEService.registerDevice({
    deviceAddress,
    privateKeyPem: peripheral.privateKey,
    publicKeyPem: peripheral.publicKey,
    measurementFactory: () => ({ type: 'spo2', value: 97, unit: '%' }),
  });

  BlockchainService.registerPeripheralKey(deviceAddress, peripheral.publicKey);
  BlockchainService.registerCentralKey(centralDeviceAddress, central.publicKey);
  BlockchainService.addValidator(validatorAddress);

  await BLEService.connectToDevice(deviceAddress);
  const peripheralMeasurement = await BLEService.receiveMeasurement({ deviceAddress, centralDeviceAddress });

  const withCentralTime = {
    ...peripheralMeasurement,
    timestampCentral: Math.floor(Date.now() / 1000),
  };

  const centralSignature = CryptoUtils.signData(
    BlockchainService.buildCentralSignaturePayload(withCentralTime),
    central.privateKey
  );

  const txHash = await BlockchainService.submitMeasurement({
    ...withCentralTime,
    centralSignature,
  }, { validatorAddress });

  const stored = await BlockchainService.getMeasurement(txHash);
  assert.deepEqual(stored.measurementData, { type: 'spo2', value: 97, unit: '%' });
  assert.equal(stored.validatedBy, validatorAddress);
});

test('First slice integration: replay is rejected', async () => {
  BLEService.resetForTests();
  BlockchainService.resetForTests();

  const peripheral = CryptoUtils.generateKeyPair();
  const central = CryptoUtils.generateKeyPair();

  const deviceAddress = '0x0000000000000000000000000000000000000E22';
  const centralDeviceAddress = '0x0000000000000000000000000000000000000C22';
  const validatorAddress = '0x0000000000000000000000000000000000000A22';

  BLEService.registerDevice({
    deviceAddress,
    privateKeyPem: peripheral.privateKey,
    publicKeyPem: peripheral.publicKey,
  });
  BlockchainService.registerPeripheralKey(deviceAddress, peripheral.publicKey);
  BlockchainService.registerCentralKey(centralDeviceAddress, central.publicKey);
  BlockchainService.addValidator(validatorAddress);
  await BLEService.connectToDevice(deviceAddress);

  const peripheralMeasurement = await BLEService.receiveMeasurement({ deviceAddress, centralDeviceAddress });
  const withCentralTime = { ...peripheralMeasurement, timestampCentral: Math.floor(Date.now() / 1000) };
  const centralSignature = CryptoUtils.signData(
    BlockchainService.buildCentralSignaturePayload(withCentralTime),
    central.privateKey
  );
  const measurement = { ...withCentralTime, centralSignature };

  await BlockchainService.submitMeasurement(measurement, { validatorAddress });
  await assert.rejects(
    async () => BlockchainService.submitMeasurement(measurement, { validatorAddress }),
    /Replay detected/
  );
});
