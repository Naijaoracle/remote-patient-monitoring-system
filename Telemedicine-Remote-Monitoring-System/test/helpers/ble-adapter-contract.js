const test = require('node:test');
const assert = require('node:assert/strict');

const BLEService = require('../../mobile-app/services/BLEService');
const CryptoUtils = require('../../mobile-app/utils/CryptoUtils');

function runBleAdapterContractSuite(name, createAdapter) {
  test(`${name} adapter contract: exposes required methods`, () => {
    const adapter = createAdapter();
    assert.equal(typeof adapter.registerDevice, 'function');
    assert.equal(typeof adapter.unregisterDevice, 'function');
    assert.equal(typeof adapter.scanForDevices, 'function');
    assert.equal(typeof adapter.connectToDevice, 'function');
    assert.equal(typeof adapter.receiveMeasurement, 'function');
  });

  test(`${name} adapter contract: scans, connects, and returns signed measurement`, async () => {
    const adapter = createAdapter();
    const deviceAddress = '0x00000000000000000000000000000000000000F1';
    const centralAddress = '0x00000000000000000000000000000000000000F2';
    const keys = CryptoUtils.generateKeyPair();

    adapter.registerDevice({
      deviceAddress,
      privateKeyPem: keys.privateKey,
      publicKeyPem: keys.publicKey,
      measurementFactory: () => ({ type: 'hr', value: 70, unit: 'bpm' }),
    });

    const scanned = await adapter.scanForDevices();
    assert.deepEqual(scanned, [deviceAddress]);
    const connected = await adapter.connectToDevice(deviceAddress);
    assert.equal(connected, true);

    const measurement = await adapter.receiveMeasurement({
      deviceAddress,
      centralDeviceAddress: centralAddress,
      challenge: 'adapter-contract-challenge',
    });
    const payload = BLEService.buildPeripheralSignaturePayload(measurement);
    assert.equal(CryptoUtils.verifySignature(payload, measurement.peripheralSignature, keys.publicKey), true);
  });

  test(`${name} adapter contract: rejects when no connected device`, async () => {
    const adapter = createAdapter();
    await assert.rejects(
      async () => adapter.receiveMeasurement({}),
      /No connected BLE device/
    );
  });

  test(`${name} adapter contract: enforces valid central address`, async () => {
    const adapter = createAdapter();
    const deviceAddress = '0x00000000000000000000000000000000000000F3';
    const keys = CryptoUtils.generateKeyPair();
    adapter.registerDevice({
      deviceAddress,
      privateKeyPem: keys.privateKey,
      publicKeyPem: keys.publicKey,
    });
    await adapter.connectToDevice(deviceAddress);

    await assert.rejects(
      async () => adapter.receiveMeasurement({
        deviceAddress,
        centralDeviceAddress: 'invalid-address',
      }),
      /Invalid central device address/
    );
  });

  test(`${name} adapter contract: enforces handshake latency bound`, async () => {
    const adapter = createAdapter();
    const deviceAddress = '0x00000000000000000000000000000000000000F4';
    const centralAddress = '0x00000000000000000000000000000000000000F5';
    const keys = CryptoUtils.generateKeyPair();
    adapter.registerDevice({
      deviceAddress,
      privateKeyPem: keys.privateKey,
      publicKeyPem: keys.publicKey,
    });
    await adapter.connectToDevice(deviceAddress);

    await assert.rejects(
      async () => adapter.receiveMeasurement({
        deviceAddress,
        centralDeviceAddress: centralAddress,
        simulatedHandshakeDelayMs: 5000,
      }),
      /BLE handshake latency exceeded/
    );
  });

  test(`${name} adapter contract: supports signer callback`, async () => {
    const adapter = createAdapter();
    const deviceAddress = '0x00000000000000000000000000000000000000F6';
    const centralAddress = '0x00000000000000000000000000000000000000F7';
    const keys = CryptoUtils.generateKeyPair();
    adapter.registerDevice({
      deviceAddress,
      signPayload: (payload) => CryptoUtils.signData(payload, keys.privateKey),
      publicKeyPem: keys.publicKey,
    });
    await adapter.connectToDevice(deviceAddress);

    const measurement = await adapter.receiveMeasurement({
      deviceAddress,
      centralDeviceAddress: centralAddress,
    });
    const payload = BLEService.buildPeripheralSignaturePayload(measurement);
    assert.equal(CryptoUtils.verifySignature(payload, measurement.peripheralSignature, keys.publicKey), true);
  });
}

module.exports = {
  runBleAdapterContractSuite,
};
