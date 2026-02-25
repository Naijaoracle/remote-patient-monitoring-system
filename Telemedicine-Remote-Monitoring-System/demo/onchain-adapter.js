const { Buffer } = require('buffer');

const SUBMIT_SIGNATURE = 'submitMeasurementHash(bytes32,address,address,uint256,uint256,bytes32)';

function normalizeHex(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function hexToBigInt(hexValue) {
  const normalized = normalizeHex(hexValue || '0x0');
  return BigInt(normalized);
}

function toWordHex(valueHexNoPrefix) {
  return valueHexNoPrefix.padStart(64, '0');
}

function encodeAddressWord(address) {
  const normalized = normalizeHex(address);
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }
  return toWordHex(normalized.slice(2));
}

function encodeBytes32Word(bytes32Value) {
  const normalized = normalizeHex(bytes32Value);
  if (!/^0x[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`Invalid bytes32 value: ${bytes32Value}`);
  }
  return normalized.slice(2);
}

function encodeUintWord(value) {
  const n = BigInt(value);
  if (n < 0n) {
    throw new Error(`Invalid uint value: ${value}`);
  }
  return toWordHex(n.toString(16));
}

function encodeSignatureForRpc(signatureText) {
  return `0x${Buffer.from(signatureText, 'utf8').toString('hex')}`;
}

function toRpcHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

const RPC_TIMEOUT_MS = 30_000;

async function defaultRpcCall(rpcUrl, method, params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }
  const parsed = await response.json();
  if (parsed.error) {
    throw new Error(`RPC ${method} failed: ${parsed.error.message || 'unknown error'}`);
  }
  return parsed.result;
}

async function resolveFunctionSelector(rpcCall, rpcUrl) {
  const digest = await rpcCall(rpcUrl, 'web3_sha3', [encodeSignatureForRpc(SUBMIT_SIGNATURE)]);
  const normalized = normalizeHex(digest);
  if (!/^0x[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Failed to derive function selector via web3_sha3');
  }
  return normalized.slice(2, 10);
}

function encodeSubmitData(selector, payload) {
  const head = [
    encodeBytes32Word(payload.measurementHash),
    encodeAddressWord(payload.deviceAddress),
    encodeAddressWord(payload.centralDeviceAddress),
    encodeUintWord(payload.timestampPeripheral),
    encodeUintWord(payload.timestampCentral),
    encodeBytes32Word(payload.challengeHash),
  ].join('');
  return `0x${selector}${head}`;
}

function parseGasUsed(receipt) {
  if (!receipt || !receipt.gasUsed) {
    return 0;
  }
  return Number(hexToBigInt(receipt.gasUsed));
}

function parseReceiptStatus(receipt) {
  if (!receipt || receipt.status === undefined || receipt.status === null) {
    return null;
  }
  return Number(hexToBigInt(receipt.status));
}

function normalizeEstimateGas(value, fallback = 800000) {
  try {
    const estimate = Number(hexToBigInt(value));
    if (!Number.isFinite(estimate) || estimate <= 0) {
      return fallback;
    }
    // Add a 20% buffer to reduce accidental OOG while still bounded for demo chain.
    return Math.max(21000, Math.min(5_000_000, Math.ceil(estimate * 1.2)));
  } catch (_error) {
    return fallback;
  }
}

async function waitForReceipt(rpcCall, rpcUrl, txHash, timeoutMs = 120000) {
  const startedAt = Date.now();
  let delayMs = 400;
  const maxDelayMs = 5000;
  while (Date.now() - startedAt < timeoutMs) {
    const receipt = await rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
    if (receipt) {
      return receipt;
    }
    const jitterMs = Math.floor(Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, delayMs + jitterMs));
    delayMs = Math.min(maxDelayMs, Math.floor(delayMs * 1.6));
  }
  throw new Error(`Timed out waiting for on-chain receipt for tx ${txHash}`);
}

function buildRpcMeasurementAdapter(options = {}) {
  const rpcUrl = String(options.rpcUrl || '').trim();
  const measurementContractAddress = normalizeHex(options.measurementContractAddress || '');
  const getValidatorAddress = options.getValidatorAddress;
  const rpcCall = typeof options.rpcCall === 'function' ? options.rpcCall : defaultRpcCall;

  if (!rpcUrl) {
    throw new Error('rpcUrl is required for on-chain measurement adapter');
  }
  if (!/^0x[a-f0-9]{40}$/.test(measurementContractAddress)) {
    throw new Error('measurementContractAddress is required and must be a valid EVM address');
  }
  if (typeof getValidatorAddress !== 'function') {
    throw new Error('getValidatorAddress callback is required');
  }

  let cachedSelector = null;
  const queuedByValidator = new Map();
  const nextNonceByValidator = new Map();

  async function withValidatorQueue(validatorAddress, fn) {
    const previous = queuedByValidator.get(validatorAddress) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    queuedByValidator.set(validatorAddress, previous.catch(() => {}).then(() => current));

    await previous.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
      if (queuedByValidator.get(validatorAddress) === current) {
        queuedByValidator.delete(validatorAddress);
      }
    }
  }

  async function reserveNonce(validatorAddress) {
    const chainNonceHex = await rpcCall(rpcUrl, 'eth_getTransactionCount', [validatorAddress, 'pending']);
    const chainNonce = hexToBigInt(chainNonceHex || '0x0');
    const cachedNonce = nextNonceByValidator.get(validatorAddress);
    const nonce = typeof cachedNonce === 'bigint' && cachedNonce > chainNonce ? cachedNonce : chainNonce;
    nextNonceByValidator.set(validatorAddress, nonce + 1n);
    return nonce;
  }

  return {
    getValidatorAddress: () => normalizeHex(getValidatorAddress() || ''),
    submitMeasurementHash: async (payload) => {
      const validatorAddress = normalizeHex(getValidatorAddress() || '');
      if (!/^0x[a-f0-9]{40}$/.test(validatorAddress)) {
        throw new Error('validatorAddress is missing or invalid for on-chain submission');
      }
      if (!cachedSelector) {
        cachedSelector = await resolveFunctionSelector(rpcCall, rpcUrl);
      }

      const data = encodeSubmitData(cachedSelector, payload);
      return withValidatorQueue(validatorAddress, async () => {
        const nonce = await reserveNonce(validatorAddress);
        const txRequest = {
          from: validatorAddress,
          to: measurementContractAddress,
          data,
          nonce: toRpcHex(nonce),
        };
        const estimatedGasHex = await rpcCall(rpcUrl, 'eth_estimateGas', [txRequest]).catch(() => null);
        txRequest.gas = toRpcHex(normalizeEstimateGas(estimatedGasHex));

        let txHash;
        try {
          txHash = await rpcCall(rpcUrl, 'eth_sendTransaction', [txRequest]);
        } catch (error) {
          // Roll back to the attempted nonce so the next queued request
          // retries it rather than fetching a potentially stale chain nonce.
          nextNonceByValidator.set(validatorAddress, nonce);
          throw error;
        }
        const receipt = await waitForReceipt(rpcCall, rpcUrl, txHash);
        const status = parseReceiptStatus(receipt);
        if (status !== 1) {
          throw new Error(`On-chain transaction reverted for tx ${txHash}`);
        }
        return {
          onChainTxHash: txHash,
          onChainGasUsed: parseGasUsed(receipt),
        };
      });
    },
  };
}

module.exports = {
  buildRpcMeasurementAdapter,
};
