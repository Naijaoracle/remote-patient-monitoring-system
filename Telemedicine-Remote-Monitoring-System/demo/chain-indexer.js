const fs = require('fs');
const path = require('path');

const CHAIN_INDEX_STATE_FILE = path.join(__dirname, '.data', 'chain-indexer-state.json');

function normalizeHex(value) {
  if (!value) {
    return '0x0';
  }
  return value.startsWith('0x') ? value : `0x${value}`;
}

function hexToNumber(hexValue) {
  if (!hexValue) {
    return 0;
  }
  return Number.parseInt(normalizeHex(hexValue), 16);
}

function toRpcHex(value) {
  const n = Number(value || 0);
  return `0x${Math.max(0, n).toString(16)}`;
}

function decodeAddress(topicWord) {
  const raw = normalizeHex(topicWord).slice(2).padStart(64, '0');
  return `0x${raw.slice(24)}`;
}

function decodeAddressWord(dataHex, offsetWords = 0) {
  const raw = normalizeHex(dataHex).slice(2);
  const start = offsetWords * 64;
  const word = raw.slice(start, start + 64).padStart(64, '0');
  return `0x${word.slice(24)}`;
}

function decodeUint256(dataHex, offsetWords = 0) {
  const raw = normalizeHex(dataHex).slice(2);
  const start = offsetWords * 64;
  const word = raw.slice(start, start + 64) || '0';
  return Number.parseInt(word, 16);
}

async function defaultRpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }
  const parsed = await response.json();
  if (parsed.error) {
    throw new Error(`RPC ${method} failed: ${parsed.error.message || 'unknown error'}`);
  }
  return parsed.result;
}

async function resolveTopicMap(rpcCall, rpcUrl) {
  const signatures = {
    ProposalCreated: 'ProposalCreated(bytes32,uint8,address,address)',
    ProposalApproved: 'ProposalApproved(bytes32,address,uint256,uint256)',
    ProposalExecuted: 'ProposalExecuted(bytes32,address)',
  };

  const topicMap = {};
  for (const [name, signature] of Object.entries(signatures)) {
    topicMap[name] = await rpcCall(rpcUrl, 'web3_sha3', [`0x${Buffer.from(signature, 'utf8').toString('hex')}`]);
  }
  return topicMap;
}

function parseValidatorManagerLog(log, topicMap) {
  const topics = Array.isArray(log.topics) ? log.topics : [];
  const topic0 = topics[0] || '';
  const txHash = log.transactionHash || '';
  const proposalId = topics[1] || '';

  if (topic0 === topicMap.ProposalCreated) {
    return {
      proposalId,
      proposalType: decodeUint256(log.data, 0) === 0 ? 'addValidator' : 'removeValidator',
      validatorId: decodeAddressWord(log.data, 1),
      action: 'create',
      status: 'success',
      txHash,
      removed: Boolean(log.removed),
    };
  }

  if (topic0 === topicMap.ProposalApproved) {
    return {
      proposalId,
      proposalType: 'unknown',
      validatorId: decodeAddress(topics[2] || '0x0'),
      action: 'approve',
      status: 'success',
      txHash,
      removed: Boolean(log.removed),
    };
  }

  if (topic0 === topicMap.ProposalExecuted) {
    return {
      proposalId,
      proposalType: 'unknown',
      validatorId: decodeAddress(topics[2] || '0x0'),
      action: 'execute',
      status: 'success',
      txHash,
      removed: Boolean(log.removed),
    };
  }

  return null;
}

function loadChainIndexerState(filePath = CHAIN_INDEX_STATE_FILE) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
  } catch (_error) {
    return {};
  }
}

function saveChainIndexerState(state, filePath = CHAIN_INDEX_STATE_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function getLastSyncedBlock(contractAddress, filePath = CHAIN_INDEX_STATE_FILE) {
  const state = loadChainIndexerState(filePath);
  const key = String(contractAddress || '').toLowerCase();
  return Number(state[key] || 0);
}

function setLastSyncedBlock(contractAddress, blockNumber, filePath = CHAIN_INDEX_STATE_FILE) {
  const state = loadChainIndexerState(filePath);
  const key = String(contractAddress || '').toLowerCase();
  state[key] = Number(blockNumber || 0);
  saveChainIndexerState(state, filePath);
}

async function syncValidatorManagerProposalEvents(options = {}) {
  const rpcUrl = String(options.rpcUrl || '').trim();
  const contractAddress = String(options.contractAddress || '').trim();
  if (!rpcUrl || !contractAddress) {
    throw new Error('rpcUrl and contractAddress are required');
  }
  const rpcCall = typeof options.rpcCall === 'function' ? options.rpcCall : defaultRpcCall;

  const topicMap = options.topicMap || await resolveTopicMap(rpcCall, rpcUrl);
  const latestHex = await rpcCall(rpcUrl, 'eth_blockNumber', []);
  const latestBlock = hexToNumber(latestHex);
  const lastSynced = getLastSyncedBlock(contractAddress, options.stateFilePath);
  const lookbackBlocks = Number(options.lookbackBlocks || 0);
  const reorgSafeLastSynced = Math.max(0, lastSynced - Math.max(0, lookbackBlocks));
  const fromBlock = Number.isFinite(options.fromBlock)
    ? Number(options.fromBlock)
    : (lastSynced > 0 ? (reorgSafeLastSynced + 1) : Number(options.startBlock || 0));
  const toBlock = Number.isFinite(options.toBlock) ? Number(options.toBlock) : latestBlock;

  if (fromBlock > toBlock) {
    return { fromBlock, toBlock, events: [] };
  }

  const logs = await rpcCall(rpcUrl, 'eth_getLogs', [{
    address: contractAddress,
    fromBlock: toRpcHex(fromBlock),
    toBlock: toRpcHex(toBlock),
  }]);

  const events = [];
  const receiptCache = new Map();
  for (const log of logs || []) {
    const event = parseValidatorManagerLog(log, topicMap);
    if (!event) {
      continue;
    }
    const txHash = event.txHash;
    if (txHash) {
      let receipt = receiptCache.get(txHash);
      if (!receipt) {
        receipt = await rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
        receiptCache.set(txHash, receipt);
      }
    event.gasUsed = hexToNumber(receipt?.gasUsed);
    } else {
      event.gasUsed = 0;
    }
    event.blockNumber = hexToNumber(log.blockNumber);
    event.logIndex = hexToNumber(log.logIndex);
    event.eventUid = `${event.txHash || 'no-tx'}:${event.logIndex}:${event.action}`;
    event.source = 'chain-indexer';
    events.push(event);
  }

  if (options.persistState !== false) {
    setLastSyncedBlock(contractAddress, toBlock, options.stateFilePath);
  }

  return {
    fromBlock,
    toBlock,
    latestBlock,
    events,
  };
}

module.exports = {
  CHAIN_INDEX_STATE_FILE,
  parseValidatorManagerLog,
  syncValidatorManagerProposalEvents,
  loadChainIndexerState,
  getLastSyncedBlock,
  setLastSyncedBlock,
};
