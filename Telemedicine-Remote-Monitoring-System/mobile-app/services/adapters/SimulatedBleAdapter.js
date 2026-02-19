const crypto = require('crypto');
const CryptoUtils = require('../../utils/CryptoUtils');

class SimulatedBleAdapter {
  constructor(deps) {
    this.buildPeripheralSignaturePayload = deps.buildPeripheralSignaturePayload;
    this.runChallengeHandshake = deps.runChallengeHandshake;
    this.isEvmAddress = deps.isEvmAddress;
    this.defaultCentralAddress = deps.defaultCentralAddress;
    this.devices = new Map();
    this.connectedDevices = new Set();
  }

  registerDevice({ deviceAddress, privateKeyPem, signPayload, publicKeyPem, measurementFactory }) {
    if (!deviceAddress || !publicKeyPem || (!privateKeyPem && typeof signPayload !== 'function')) {
      throw new Error('Invalid device registration payload');
    }
    if (!this.isEvmAddress(deviceAddress)) {
      throw new Error('Invalid device address');
    }

    this.devices.set(deviceAddress, {
      deviceAddress,
      privateKeyPem,
      signPayload,
      publicKeyPem,
      measurementFactory: measurementFactory || (() => ({ type: 'heart_rate', value: 72, unit: 'bpm' })),
    });
  }

  unregisterDevice(deviceAddress) {
    this.devices.delete(deviceAddress);
    this.connectedDevices.delete(deviceAddress);
  }

  async scanForDevices() {
    return Array.from(this.devices.keys());
  }

  async connectToDevice(deviceAddress) {
    if (!this.devices.has(deviceAddress)) {
      return false;
    }
    this.connectedDevices.add(deviceAddress);
    return true;
  }

  async receiveMeasurement(options = {}) {
    const {
      deviceAddress,
      centralDeviceAddress = this.defaultCentralAddress,
      challenge,
      measurementData,
    } = options;

    const resolvedAddress = deviceAddress || Array.from(this.connectedDevices)[0];
    if (!resolvedAddress || !this.connectedDevices.has(resolvedAddress)) {
      throw new Error('No connected BLE device');
    }
    if (!this.isEvmAddress(centralDeviceAddress)) {
      throw new Error('Invalid central device address');
    }

    const device = this.devices.get(resolvedAddress);
    const timestampPeripheral = Math.floor(Date.now() / 1000);
    const resolvedMeasurementData = measurementData || device.measurementFactory();
    const resolvedChallenge = challenge || crypto.randomBytes(16).toString('hex');

    const peripheralPayload = this.buildPeripheralSignaturePayload({
      deviceAddress: resolvedAddress,
      centralDeviceAddress,
      timestampPeripheral,
      ...this.runChallengeHandshake(options),
      challenge: resolvedChallenge,
      measurementData: resolvedMeasurementData,
    });

    const peripheralSignature = typeof device.signPayload === 'function'
      ? device.signPayload(peripheralPayload)
      : CryptoUtils.signData(peripheralPayload, device.privateKeyPem);

    return {
      ...peripheralPayload,
      peripheralSignature,
    };
  }

  resetForTests() {
    this.devices.clear();
    this.connectedDevices.clear();
  }
}

module.exports = SimulatedBleAdapter;
