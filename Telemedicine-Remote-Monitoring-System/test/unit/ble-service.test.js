const test = require('node:test');
const assert = require('node:assert/strict');

const BLEService = require('../../mobile-app/services/BLEService');
const CryptoUtils = require('../../mobile-app/utils/CryptoUtils');

test.beforeEach(() => {
  BLEService.resetForTests();
});

test('BLEService scans and connects registered devices', async () => {
  const deviceAddress = '0x00000000000000000000000000000000000000A1';
  const keys = CryptoUtils.generateKeyPair();
  BLEService.registerDevice({
    deviceAddress,
    privateKeyPem: keys.privateKey,
    publicKeyPem: keys.publicKey,
  });

  const devices = await BLEService.scanForDevices();
  assert.deepEqual(devices, [deviceAddress]);

  const connected = await BLEService.connectToDevice(deviceAddress);
  assert.equal(connected, true);
});

test('BLEService returns signed peripheral payload', async () => {
  const deviceAddress = '0x00000000000000000000000000000000000000A2';
  const centralAddress = '0x00000000000000000000000000000000000000B1';
  const keys = CryptoUtils.generateKeyPair();
  BLEService.registerDevice({
    deviceAddress,
    privateKeyPem: keys.privateKey,
    publicKeyPem: keys.publicKey,
    measurementFactory: () => ({ type: 'bp', value: '120/80', unit: 'mmHg' }),
  });

  await BLEService.connectToDevice(deviceAddress);
  const measurement = await BLEService.receiveMeasurement({
    deviceAddress,
    centralDeviceAddress: centralAddress,
    challenge: 'challenge-123',
  });

  const payload = BLEService.buildPeripheralSignaturePayload(measurement);
  const isValid = CryptoUtils.verifySignature(payload, measurement.peripheralSignature, keys.publicKey);

  assert.equal(isValid, true);
  assert.equal(typeof measurement.handshakeRequestAtMs, 'number');
  assert.equal(typeof measurement.handshakeResponseAtMs, 'number');
  assert.equal(typeof measurement.handshakeLatencyMs, 'number');
  assert.equal(
    measurement.handshakeResponseAtMs - measurement.handshakeRequestAtMs,
    measurement.handshakeLatencyMs
  );
  assert.deepEqual(measurement.measurementData, { type: 'bp', value: '120/80', unit: 'mmHg' });
});

test('BLEService rejects handshake latency beyond bound', async () => {
  const deviceAddress = '0x00000000000000000000000000000000000000A3';
  const centralAddress = '0x00000000000000000000000000000000000000B3';
  const keys = CryptoUtils.generateKeyPair();
  BLEService.registerDevice({
    deviceAddress,
    privateKeyPem: keys.privateKey,
    publicKeyPem: keys.publicKey,
  });

  await BLEService.connectToDevice(deviceAddress);
  await assert.rejects(
    async () => BLEService.receiveMeasurement({
      deviceAddress,
      centralDeviceAddress: centralAddress,
      simulatedHandshakeDelayMs: 5000,
    }),
    /BLE handshake latency exceeded/
  );
});

test('BLEService supports signer callback registration', async () => {
  const deviceAddress = '0x00000000000000000000000000000000000000A4';
  const centralAddress = '0x00000000000000000000000000000000000000B4';
  const keys = CryptoUtils.generateKeyPair();
  BLEService.registerDevice({
    deviceAddress,
    signPayload: (payload) => CryptoUtils.signData(payload, keys.privateKey),
    publicKeyPem: keys.publicKey,
  });

  await BLEService.connectToDevice(deviceAddress);
  const measurement = await BLEService.receiveMeasurement({
    deviceAddress,
    centralDeviceAddress: centralAddress,
  });
  const payload = BLEService.buildPeripheralSignaturePayload(measurement);
  assert.equal(CryptoUtils.verifySignature(payload, measurement.peripheralSignature, keys.publicKey), true);
});

test('BLEService allows adapter injection for future platform BLE', async () => {
  const fakeMeasurement = {
    deviceAddress: '0x0000000000000000000000000000000000000F01',
    centralDeviceAddress: '0x0000000000000000000000000000000000000F02',
    timestampPeripheral: 1700000000,
    handshakeRequestAtMs: 1700000000000,
    handshakeResponseAtMs: 1700000000100,
    handshakeLatencyMs: 100,
    challenge: 'adapter-challenge',
    measurementData: { type: 'temp', value: 36.8, unit: 'C' },
    peripheralSignature: 'stub-signature',
  };
  let connectedTo = null;

  BLEService.setAdapter({
    registerDevice: () => {},
    unregisterDevice: () => {},
    scanForDevices: async () => [fakeMeasurement.deviceAddress],
    connectToDevice: async (deviceAddress) => {
      connectedTo = deviceAddress;
      return true;
    },
    receiveMeasurement: async () => fakeMeasurement,
    resetForTests: () => {},
  });

  const scanned = await BLEService.scanForDevices();
  assert.deepEqual(scanned, [fakeMeasurement.deviceAddress]);

  const connected = await BLEService.connectToDevice(fakeMeasurement.deviceAddress);
  assert.equal(connected, true);
  assert.equal(connectedTo, fakeMeasurement.deviceAddress);

  const measured = await BLEService.receiveMeasurement();
  assert.deepEqual(measured, fakeMeasurement);
});
