const Config = require('../utils/Config');
const SimulatedBleAdapter = require('./adapters/SimulatedBleAdapter');

const DEFAULT_CENTRAL_ADDRESS = '0x000000000000000000000000000000000000C001';

function isEvmAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function buildPeripheralSignaturePayload({
  deviceAddress,
  centralDeviceAddress,
  timestampPeripheral,
  handshakeRequestAtMs,
  handshakeResponseAtMs,
  handshakeLatencyMs,
  challenge,
  measurementData,
}) {
  return {
    deviceAddress,
    centralDeviceAddress,
    timestampPeripheral,
    handshakeRequestAtMs,
    handshakeResponseAtMs,
    handshakeLatencyMs,
    challenge,
    measurementData,
  };
}

function runChallengeHandshake(options = {}) {
  const requestAtMs = Number.isFinite(options.handshakeRequestAtMs)
    ? Math.floor(options.handshakeRequestAtMs)
    : Date.now();
  const delayMs = Number.isFinite(options.simulatedHandshakeDelayMs)
    ? Math.max(0, Math.floor(options.simulatedHandshakeDelayMs))
    : 0;
  const responseAtMs = requestAtMs + delayMs;
  const latencyMs = responseAtMs - requestAtMs;

  if (latencyMs > Config.BLE_HANDSHAKE_MAX_LATENCY_MS) {
    throw new Error('BLE handshake latency exceeded');
  }

  return {
    handshakeRequestAtMs: requestAtMs,
    handshakeResponseAtMs: responseAtMs,
    handshakeLatencyMs: latencyMs,
  };
}

function createSimulatedAdapter() {
  return new SimulatedBleAdapter({
    buildPeripheralSignaturePayload,
    runChallengeHandshake,
    isEvmAddress,
    defaultCentralAddress: DEFAULT_CENTRAL_ADDRESS,
  });
}

let activeAdapter = createSimulatedAdapter();

function assertAdapterContract(adapter) {
  const requiredMethods = [
    'registerDevice',
    'unregisterDevice',
    'scanForDevices',
    'connectToDevice',
    'receiveMeasurement',
  ];
  for (const methodName of requiredMethods) {
    if (!adapter || typeof adapter[methodName] !== 'function') {
      throw new Error(`BLE adapter missing method: ${methodName}`);
    }
  }
}

function setAdapter(adapter) {
  assertAdapterContract(adapter);
  activeAdapter = adapter;
}

function useSimulatedAdapter() {
  activeAdapter = createSimulatedAdapter();
}

function registerDevice(payload) {
  return activeAdapter.registerDevice(payload);
}

function unregisterDevice(deviceAddress) {
  return activeAdapter.unregisterDevice(deviceAddress);
}

function scanForDevices() {
  return activeAdapter.scanForDevices();
}

function connectToDevice(deviceAddress) {
  return activeAdapter.connectToDevice(deviceAddress);
}

function receiveMeasurement(options = {}) {
  return activeAdapter.receiveMeasurement(options);
}

function resetForTests() {
  if (activeAdapter && typeof activeAdapter.resetForTests === 'function') {
    activeAdapter.resetForTests();
  }
  useSimulatedAdapter();
}

module.exports = {
  setAdapter,
  useSimulatedAdapter,
  registerDevice,
  unregisterDevice,
  scanForDevices,
  connectToDevice,
  receiveMeasurement,
  runChallengeHandshake,
  buildPeripheralSignaturePayload,
  isEvmAddress,
  resetForTests,
};
