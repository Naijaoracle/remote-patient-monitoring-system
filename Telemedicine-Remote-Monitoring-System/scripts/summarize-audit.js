const fs = require('fs');
const path = require('path');

function readAuditReport(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { error: `Failed to parse ${path.basename(filePath)}: ${error.message}` };
  }
}

function vulnCounts(report) {
  if (!report || typeof report !== 'object') {
    return { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  }
  const metadata = report.metadata && report.metadata.vulnerabilities;
  if (metadata) {
    return {
      info: Number(metadata.info || 0),
      low: Number(metadata.low || 0),
      moderate: Number(metadata.moderate || 0),
      high: Number(metadata.high || 0),
      critical: Number(metadata.critical || 0),
    };
  }
  return { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
}

function main() {
  const reportDir = process.argv[2];
  const criticalOnly = process.argv.includes('--critical-only');
  const errorCountOnly = process.argv.includes('--error-count');
  const quiet = criticalOnly || errorCountOnly;
  if (!reportDir) {
    console.error('Usage: node scripts/summarize-audit.js <reportDir> [--critical-only]');
    process.exit(1);
  }

  const files = fs.existsSync(reportDir)
    ? fs.readdirSync(reportDir).filter((name) => name.endsWith('-audit.json'))
    : [];

  const totals = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  let errorCount = 0;

  for (const fileName of files) {
    const filePath = path.join(reportDir, fileName);
    const report = readAuditReport(filePath);
    if (typeof report.error === 'string') {
      errorCount += 1;
      if (!quiet) {
        console.log(`${fileName}: ERROR ${report.error}`);
      }
      continue;
    }
    if (report && report.error && typeof report.error === 'object' && report.error.summary) {
      errorCount += 1;
      if (!quiet) {
        console.log(`${fileName}: ERROR ${report.error.summary}`);
      }
      continue;
    }
    if (typeof report.message === 'string' && report.message.length > 0 && !report.metadata) {
      errorCount += 1;
      if (!quiet) {
        console.log(`${fileName}: ERROR ${report.message}`);
      }
      continue;
    }
    const counts = vulnCounts(report);
    totals.info += counts.info;
    totals.low += counts.low;
    totals.moderate += counts.moderate;
    totals.high += counts.high;
    totals.critical += counts.critical;

    if (!quiet) {
      console.log(
        `${fileName}: info=${counts.info} low=${counts.low} moderate=${counts.moderate} high=${counts.high} critical=${counts.critical}`
      );
    }
  }

  if (criticalOnly) {
    process.stdout.write(String(totals.critical));
    return;
  }

  if (errorCountOnly) {
    process.stdout.write(String(errorCount));
    return;
  }

  console.log(
    `TOTAL: info=${totals.info} low=${totals.low} moderate=${totals.moderate} high=${totals.high} critical=${totals.critical}`
  );
  if (errorCount > 0) {
    console.log(`AUDIT_ERRORS: ${errorCount}`);
  }
}

main();
