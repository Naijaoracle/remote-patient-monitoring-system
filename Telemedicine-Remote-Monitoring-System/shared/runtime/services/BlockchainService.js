const CryptoUtils = require('../utils/CryptoUtils');
const Config = require('../utils/Config');
const { challengeToHash } = require('./SolidityMeasurementAdapter');

const transactions = new Map();
const usedChallenges = new Set();
const peripheralKeys = new Map();
const centralKeys = new Map();
const validators = new Set();
const revokedPeripheralKeys = new Set();
const revokedCentralKeys = new Set();
let contractAdapter = null;

function isEvmAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function buildPeripheralSignaturePayload(data) {
  return {
    deviceAddress: data.deviceAddress,
    centralDeviceAddress: data.centralDeviceAddress,
    timestampPeripheral: data.timestampPeripheral,
    handshakeRequestAtMs: data.handshakeRequestAtMs,
    handshakeResponseAtMs: data.handshakeResponseAtMs,
    handshakeLatencyMs: data.handshakeLatencyMs,
    challenge: data.challenge,
    measurementData: data.measurementData,
  };
}

function buildCentralSignaturePayload(data) {
  return {
    ...buildPeripheralSignaturePayload(data),
    peripheralSignature: data.peripheralSignature,
    timestampCentral: data.timestampCentral,
  };
}

function registerPeripheralKey(deviceAddress, publicKeyPem) {
  if (!isEvmAddress(deviceAddress)) {
    throw new Error('Invalid peripheral address');
  }
  peripheralKeys.set(deviceAddress, publicKeyPem);
  revokedPeripheralKeys.delete(deviceAddress);
}

function registerCentralKey(centralDeviceAddress, publicKeyPem) {
  if (!isEvmAddress(centralDeviceAddress)) {
    throw new Error('Invalid central address');
  }
  centralKeys.set(centralDeviceAddress, publicKeyPem);
  revokedCentralKeys.delete(centralDeviceAddress);
}

function addValidator(validatorId) {
  if (!isEvmAddress(validatorId)) {
    throw new Error('Invalid validator address');
  }
  validators.add(validatorId);
}

function setContractAdapter(adapter) {
  contractAdapter = adapter;
}

function revokePeripheralKey(deviceAddress) {
  if (!isEvmAddress(deviceAddress)) {
    throw new Error('Invalid peripheral address');
  }
  revokedPeripheralKeys.add(deviceAddress);
}

function unrevokePeripheralKey(deviceAddress) {
  if (!isEvmAddress(deviceAddress)) {
    throw new Error('Invalid peripheral address');
  }
  revokedPeripheralKeys.delete(deviceAddress);
}

function revokeCentralKey(centralDeviceAddress) {
  if (!isEvmAddress(centralDeviceAddress)) {
    throw new Error('Invalid central address');
  }
  revokedCentralKeys.add(centralDeviceAddress);
}

function unrevokeCentralKey(centralDeviceAddress) {
  if (!isEvmAddress(centralDeviceAddress)) {
    throw new Error('Invalid central address');
  }
  revokedCentralKeys.delete(centralDeviceAddress);
}

function assertValidMeasurement(measurement) {
  const requiredFields = [
    'deviceAddress',
    'centralDeviceAddress',
    'timestampPeripheral',
    'timestampCentral',
    'handshakeRequestAtMs',
    'handshakeResponseAtMs',
    'handshakeLatencyMs',
    'challenge',
    'measurementData',
    'peripheralSignature',
    'centralSignature',
  ];

  for (const field of requiredFields) {
    if (measurement[field] === undefined || measurement[field] === null || measurement[field] === '') {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!isEvmAddress(measurement.deviceAddress)) {
    throw new Error('Invalid device address');
  }
  if (!isEvmAddress(measurement.centralDeviceAddress)) {
    throw new Error('Invalid central device address');
  }
  if (revokedPeripheralKeys.has(measurement.deviceAddress)) {
    throw new Error('Peripheral key revoked');
  }
  if (revokedCentralKeys.has(measurement.centralDeviceAddress)) {
    throw new Error('Central key revoked');
  }

  if (validators.size === 0) {
    throw new Error('No validators available for PoA confirmation');
  }

  const peripheralPublicKey = peripheralKeys.get(measurement.deviceAddress);
  if (!peripheralPublicKey) {
    throw new Error('Unknown peripheral device');
  }

  const centralPublicKey = centralKeys.get(measurement.centralDeviceAddress);
  if (!centralPublicKey) {
    throw new Error('Unknown central device');
  }

  const peripheralPayload = buildPeripheralSignaturePayload(measurement);
  if (!CryptoUtils.verifySignature(peripheralPayload, measurement.peripheralSignature, peripheralPublicKey)) {
    throw new Error('Invalid peripheral signature');
  }

  const centralPayload = buildCentralSignaturePayload(measurement);
  if (!CryptoUtils.verifySignature(centralPayload, measurement.centralSignature, centralPublicKey)) {
    throw new Error('Invalid central signature');
  }

  if (measurement.timestampCentral < measurement.timestampPeripheral) {
    throw new Error('Central timestamp before peripheral');
  }

  if (!Number.isFinite(measurement.handshakeRequestAtMs) || !Number.isFinite(measurement.handshakeResponseAtMs)) {
    throw new Error('Invalid BLE handshake timestamps');
  }
  if (!Number.isFinite(measurement.handshakeLatencyMs) || measurement.handshakeLatencyMs < 0) {
    throw new Error('Invalid BLE handshake latency');
  }
  if (measurement.handshakeResponseAtMs < measurement.handshakeRequestAtMs) {
    throw new Error('BLE handshake response before request');
  }
  const computedLatencyMs = measurement.handshakeResponseAtMs - measurement.handshakeRequestAtMs;
  if (computedLatencyMs !== measurement.handshakeLatencyMs) {
    throw new Error('BLE handshake latency mismatch');
  }
  if (measurement.handshakeLatencyMs > Config.BLE_HANDSHAKE_MAX_LATENCY_MS) {
    throw new Error('BLE handshake latency exceeded');
  }

  const proximityDelta = measurement.timestampCentral - measurement.timestampPeripheral;
  if (proximityDelta > Config.PROXIMITY_WINDOW_SECONDS) {
    throw new Error('Proximity window exceeded');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - measurement.timestampCentral) > Config.MAX_CLOCK_SKEW_SECONDS) {
    throw new Error('Measurement is stale or has excessive clock skew');
  }

  if (usedChallenges.has(measurement.challenge)) {
    throw new Error('Replay detected: challenge already used');
  }
}

async function submitMeasurement(measurement, options = {}) {
  assertValidMeasurement(measurement);

  const resolvedValidator = options.validatorAddress;
  let validator = resolvedValidator;
  if (!validator) {
    if (validators.size === 1) {
      validator = Array.from(validators)[0];
    } else {
      throw new Error('validatorAddress is required when multiple validators are registered');
    }
  }
  if (!validators.has(validator)) {
    throw new Error('Unknown validator address');
  }
  if (contractAdapter && typeof contractAdapter.getValidatorAddress === 'function') {
    const adapterValidator = contractAdapter.getValidatorAddress();
    if (adapterValidator && adapterValidator.toLowerCase() !== validator.toLowerCase()) {
      throw new Error('validatorAddress does not match contract adapter account');
    }
  }

  const txPayload = {
    ...measurement,
    validatedBy: validator,
    validatedAt: Math.floor(Date.now() / 1000),
  };

  const txHash = `0x${CryptoUtils.digest({ payload: txPayload, index: transactions.size })}`;
  const measurementHash = `0x${CryptoUtils.digest(buildCentralSignaturePayload(measurement))}`;
  const challengeHash = challengeToHash(measurement.challenge);
  // Reserve challenge before adapter calls to prevent local replay if chain succeeds
  // but adapter response handling fails midway.
  usedChallenges.add(measurement.challenge);

  try {
    if (contractAdapter) {
      const onChainResult = await contractAdapter.submitMeasurementHash({
        measurementHash,
        challengeHash,
        deviceAddress: measurement.deviceAddress,
        centralDeviceAddress: measurement.centralDeviceAddress,
        timestampPeripheral: measurement.timestampPeripheral,
        timestampCentral: measurement.timestampCentral,
      });
      txPayload.onChainTxHash = onChainResult.onChainTxHash;
      txPayload.onChainGasUsed = Number(onChainResult.onChainGasUsed || 0);
      txPayload.measurementHash = measurementHash;
      txPayload.challengeHash = challengeHash;
    }
  } catch (error) {
    throw new Error(`Contract submission failed: ${error.message}`);
  }

  transactions.set(txHash, txPayload);
  return txHash;
}

async function getMeasurement(txHash) {
  return transactions.get(txHash) || null;
}

function resetForTests() {
  transactions.clear();
  usedChallenges.clear();
  peripheralKeys.clear();
  centralKeys.clear();
  validators.clear();
  revokedPeripheralKeys.clear();
  revokedCentralKeys.clear();
  contractAdapter = null;
}

module.exports = {
  registerPeripheralKey,
  registerCentralKey,
  addValidator,
  setContractAdapter,
  revokePeripheralKey,
  unrevokePeripheralKey,
  revokeCentralKey,
  unrevokeCentralKey,
  submitMeasurement,
  getMeasurement,
  buildPeripheralSignaturePayload,
  buildCentralSignaturePayload,
  isEvmAddress,
  resetForTests,
};
