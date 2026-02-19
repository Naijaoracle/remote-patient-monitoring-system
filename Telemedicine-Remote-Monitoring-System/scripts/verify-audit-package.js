#!/usr/bin/env node
const { verifyAuditPackageFile } = require('./lib/verify-audit-package-lib');

function usage() {
  console.error('Usage: node scripts/verify-audit-package.js <package.json>');
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    usage();
    process.exit(1);
  }
  const result = verifyAuditPackageFile(inputPath);
  if (!result.ok) {
    console.error(`INVALID: ${result.message}`);
    process.exit(result.code === 'invalid_package' ? 2 : 1);
  }
  console.log(`VALID: signer=${result.signerId} entries=${result.entryCount} payloadHash=${result.payloadHash}`);
}

main();
