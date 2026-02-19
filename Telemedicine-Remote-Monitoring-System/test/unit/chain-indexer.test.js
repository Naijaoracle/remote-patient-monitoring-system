const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseValidatorManagerLog,
  syncValidatorManagerProposalEvents,
  getLastSyncedBlock,
  setLastSyncedBlock,
} = require('../../demo/chain-indexer');

function createStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-chain-indexer-'));
  return path.join(dir, 'state.json');
}

test('chain indexer parses validator manager proposal logs', () => {
  const topicMap = {
    ProposalCreated: '0xtopic-created',
    ProposalApproved: '0xtopic-approved',
    ProposalExecuted: '0xtopic-executed',
  };
  const log = {
    topics: [
      topicMap.ProposalCreated,
      '0x' + '11'.repeat(32),
      '0x' + '22'.repeat(32),
    ],
    data: `0x${'0'.repeat(63)}1${'0'.repeat(24)}${'33'.repeat(20)}`,
    transactionHash: '0xtx1',
  };

  const parsed = parseValidatorManagerLog(log, topicMap);
  assert.equal(parsed.action, 'create');
  assert.equal(parsed.proposalType, 'removeValidator');
  assert.equal(parsed.validatorId, `0x${'33'.repeat(20)}`);
});

test('chain indexer syncs logs and persists block cursor', async () => {
  const stateFilePath = createStateFile();
  const topicMap = {
    ProposalCreated: '0xtopic-created',
    ProposalApproved: '0xtopic-approved',
    ProposalExecuted: '0xtopic-executed',
  };
  const calls = [];
  const rpcCall = async (_rpcUrl, method, params) => {
    calls.push({ method, params });
    if (method === 'eth_blockNumber') {
      return '0x32';
    }
    if (method === 'eth_getLogs') {
      return [{
        blockNumber: '0x2',
        logIndex: '0x0',
        transactionHash: '0xtxabc',
        topics: [
          topicMap.ProposalApproved,
          '0x' + 'aa'.repeat(32),
          '0x' + '0'.repeat(24) + 'bb'.repeat(20),
        ],
        data: `0x${'0'.repeat(63)}2${'0'.repeat(63)}2`,
      }];
    }
    if (method === 'eth_getTransactionReceipt') {
      return { gasUsed: '0x5208' };
    }
    if (method === 'web3_sha3') {
      return `0xhash${params[0].slice(-6)}`;
    }
    throw new Error(`Unexpected RPC method ${method}`);
  };

  const result = await syncValidatorManagerProposalEvents({
    rpcUrl: 'http://local',
    contractAddress: '0x0000000000000000000000000000000000000abc',
    fromBlock: 1,
    toBlock: 2,
    topicMap,
    rpcCall,
    stateFilePath,
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].action, 'approve');
  assert.equal(result.events[0].gasUsed, 21000);
  assert.equal(getLastSyncedBlock('0x0000000000000000000000000000000000000abc', stateFilePath), 2);
  assert.equal(calls.some((call) => call.method === 'eth_getLogs'), true);
});

test('chain indexer applies reorg lookback to computed fromBlock', async () => {
  const stateFilePath = createStateFile();
  const topicMap = {
    ProposalCreated: '0xtopic-created',
    ProposalApproved: '0xtopic-approved',
    ProposalExecuted: '0xtopic-executed',
  };
  setLastSyncedBlock('0x0000000000000000000000000000000000000def', 100, stateFilePath);

  let seenFromBlock = null;
  const rpcCall = async (_rpcUrl, method, params) => {
    if (method === 'eth_blockNumber') {
      return '0x70';
    }
    if (method === 'eth_getLogs') {
      seenFromBlock = params[0].fromBlock;
      return [];
    }
    if (method === 'web3_sha3') {
      return `0xhash${params[0].slice(-6)}`;
    }
    throw new Error(`Unexpected RPC method ${method}`);
  };

  await syncValidatorManagerProposalEvents({
    rpcUrl: 'http://local',
    contractAddress: '0x0000000000000000000000000000000000000def',
    lookbackBlocks: 12,
    topicMap,
    rpcCall,
    stateFilePath,
  });

  assert.equal(seenFromBlock, '0x59');
});
