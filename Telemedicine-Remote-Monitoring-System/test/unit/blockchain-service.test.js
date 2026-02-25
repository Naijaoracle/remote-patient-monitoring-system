const test = require('node:test');
const assert = require('node:assert/strict');

const BLEService = require('../../shared/runtime/services/BLEService');
const BlockchainService = require('../../shared/runtime/services/BlockchainService');
const CryptoUtils = require('../../shared/runtime/utils/CryptoUtils');

test.beforeEach(() => {
  BLEService.resetForTests();
  BlockchainService.resetForTests();
});

async function buildMeasurementFixture() {
  const peripheral = CryptoUtils.generateKeyPair();
  const central = CryptoUtils.generateKeyPair();

  const deviceAddress = '0x00000000000000000000000000000000000000C3';
  const centralDeviceAddress = '0x00000000000000000000000000000000000000D3';
  const validatorAddress = '0x00000000000000000000000000000000000000E1';

  BLEService.registerDevice({
    deviceAddress,
    privateKeyPem: peripheral.privateKey,
    publicKeyPem: peripheral.publicKey,
  });

  await BLEService.connectToDevice(deviceAddress);

  BlockchainService.registerPeripheralKey(deviceAddress, peripheral.publicKey);
  BlockchainService.registerCentralKey(centralDeviceAddress, central.publicKey);
  BlockchainService.addValidator(validatorAddress);

  const peripheralMeasurement = await BLEService.receiveMeasurement({
    deviceAddress,
    centralDeviceAddress,
    challenge: 'challenge-blockchain-1',
  });

  const timestampCentral = Math.floor(Date.now() / 1000);
  const payloadWithCentralTime = {
    ...peripheralMeasurement,
    timestampCentral,
  };

  const centralSignature = CryptoUtils.signData(
    BlockchainService.buildCentralSignaturePayload(payloadWithCentralTime),
    central.privateKey
  );

  return {
    validatorAddress,
    peripheralPrivateKey: peripheral.privateKey,
    centralPrivateKey: central.privateKey,
    measurement: {
      ...payloadWithCentralTime,
      centralSignature,
    },
  };
}

test('BlockchainService accepts valid double-signed measurement', async () => {
  const fixture = await buildMeasurementFixture();
  const txHash = await BlockchainService.submitMeasurement(
    fixture.measurement,
    { validatorAddress: fixture.validatorAddress }
  );

  assert.equal(txHash.startsWith('0x'), true);

  const stored = await BlockchainService.getMeasurement(txHash);
  assert.equal(stored.deviceAddress, fixture.measurement.deviceAddress);
  assert.equal(stored.validatedBy, fixture.validatorAddress);
});

test('BlockchainService rejects replayed challenge', async () => {
  const fixture = await buildMeasurementFixture();
  await BlockchainService.submitMeasurement(
    fixture.measurement,
    { validatorAddress: fixture.validatorAddress }
  );

  await assert.rejects(
    async () => BlockchainService.submitMeasurement(
      fixture.measurement,
      { validatorAddress: fixture.validatorAddress }
    ),
    /Replay detected/
  );
});

test('BlockchainService forwards validated payload to contract adapter when configured', async () => {
  const fixture = await buildMeasurementFixture();
  let adapterCalled = false;

  BlockchainService.setContractAdapter({
    submitMeasurementHash: async (payload) => {
      adapterCalled = true;
      assert.equal(payload.deviceAddress, fixture.measurement.deviceAddress);
      assert.equal(payload.centralDeviceAddress, fixture.measurement.centralDeviceAddress);
      assert.equal(typeof payload.measurementHash, 'string');
      assert.equal(typeof payload.challengeHash, 'string');
      return { onChainTxHash: '0xabc123', onChainGasUsed: 210000 };
    },
  });

  const txHash = await BlockchainService.submitMeasurement(
    fixture.measurement,
    { validatorAddress: fixture.validatorAddress }
  );
  const stored = await BlockchainService.getMeasurement(txHash);

  assert.equal(adapterCalled, true);
  assert.equal(stored.onChainTxHash, '0xabc123');
  assert.equal(stored.onChainGasUsed, 210000);
});

test('BlockchainService rejects central timestamps before peripheral timestamps', async () => {
  const fixture = await buildMeasurementFixture();
  const invalid = {
    ...fixture.measurement,
    timestampCentral: fixture.measurement.timestampPeripheral - 1,
  };
  invalid.centralSignature = CryptoUtils.signData(
    BlockchainService.buildCentralSignaturePayload(invalid),
    fixture.centralPrivateKey
  );

  await assert.rejects(
    async () => BlockchainService.submitMeasurement(invalid, { validatorAddress: fixture.validatorAddress }),
    /Central timestamp before peripheral/
  );
});

test('BlockchainService rejects revoked peripheral keys', async () => {
  const fixture = await buildMeasurementFixture();
  BlockchainService.revokePeripheralKey(fixture.measurement.deviceAddress);

  await assert.rejects(
    async () => BlockchainService.submitMeasurement(
      fixture.measurement,
      { validatorAddress: fixture.validatorAddress }
    ),
    /Peripheral key revoked/
  );
});

test('BlockchainService rejects revoked central keys', async () => {
  const fixture = await buildMeasurementFixture();
  BlockchainService.revokeCentralKey(fixture.measurement.centralDeviceAddress);

  await assert.rejects(
    async () => BlockchainService.submitMeasurement(
      fixture.measurement,
      { validatorAddress: fixture.validatorAddress }
    ),
    /Central key revoked/
  );
});

test('BlockchainService rejects inconsistent BLE handshake latency', async () => {
  const fixture = await buildMeasurementFixture();
  const invalid = {
    ...fixture.measurement,
    handshakeLatencyMs: fixture.measurement.handshakeLatencyMs + 1,
  };
  invalid.peripheralSignature = CryptoUtils.signData(
    BlockchainService.buildPeripheralSignaturePayload(invalid),
    fixture.peripheralPrivateKey
  );
  invalid.centralSignature = CryptoUtils.signData(
    BlockchainService.buildCentralSignaturePayload(invalid),
    fixture.centralPrivateKey
  );

  await assert.rejects(
    async () => BlockchainService.submitMeasurement(
      invalid,
      { validatorAddress: fixture.validatorAddress }
    ),
    /BLE handshake latency mismatch/
  );
});
