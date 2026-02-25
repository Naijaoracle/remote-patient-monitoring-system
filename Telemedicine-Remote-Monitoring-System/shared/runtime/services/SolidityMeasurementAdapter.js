const crypto = require('crypto');

function isEvmAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function toBytes32(hexPrefixedOrHex) {
  if (!hexPrefixedOrHex) {
    return '0x' + '0'.repeat(64);
  }

  const raw = hexPrefixedOrHex.startsWith('0x') ? hexPrefixedOrHex.slice(2) : hexPrefixedOrHex;
  return `0x${raw.padStart(64, '0').slice(0, 64)}`;
}

function buildAdapter(measurementContract, validatorAccount) {
  if (!measurementContract) {
    throw new Error('Measurement contract instance is required');
  }

  async function submitMeasurementHash(payload) {
    if (!isEvmAddress(payload.deviceAddress)) {
      throw new Error('Invalid device address');
    }
    if (!isEvmAddress(payload.centralDeviceAddress)) {
      throw new Error('Invalid central device address');
    }
    if (!isEvmAddress(validatorAccount)) {
      throw new Error('Invalid validator account');
    }

    const tx = await measurementContract.submitMeasurementHash(
      toBytes32(payload.measurementHash),
      payload.deviceAddress,
      payload.centralDeviceAddress,
      payload.timestampPeripheral,
      payload.timestampCentral,
      toBytes32(payload.challengeHash),
      { from: validatorAccount }
    );

    return {
      onChainTxHash: tx.tx,
      onChainGasUsed: Number(tx.receipt?.gasUsed || 0),
    };
  }

  async function getMeasurementByHash(measurementHash) {
    return measurementContract.getMeasurement(toBytes32(measurementHash));
  }

  return {
    submitMeasurementHash,
    getMeasurementByHash,
    getValidatorAddress: () => validatorAccount,
  };
}

function challengeToHash(challenge) {
  const hex = crypto.createHash('sha256').update(challenge).digest('hex');
  return `0x${hex}`;
}

module.exports = {
  buildAdapter,
  challengeToHash,
  toBytes32,
  isEvmAddress,
};
