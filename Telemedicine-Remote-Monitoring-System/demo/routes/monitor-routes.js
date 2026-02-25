async function handleMonitorRoutes(ctx) {
  const {
    req,
    res,
    url,
    auth,
    json,
    readBody,
    writeAudit,
    exportAuditEntries,
    summarizeAuditEntries,
    exportAlerts,
    exportValidatorTelemetry,
    summarizeValidatorTelemetry,
    exportProposalTelemetry,
    summarizeProposalTelemetry,
    appendProposalTelemetry,
    syncProposalEventsFromChain,
    getLastSyncedBlock,
    validatorManagerAddress,
  } = ctx;

  if (req.method === 'GET' && url.pathname === '/api/monitor/summary') {
    const entries = exportAuditEntries({ limit: 1000 });
    const summary = summarizeAuditEntries(entries);
    const validatorTelemetry = exportValidatorTelemetry({ limit: 1000 });
    const validatorSummary = summarizeValidatorTelemetry(validatorTelemetry);
    const proposalTelemetry = exportProposalTelemetry({ limit: 1000 });
    const proposalSummary = summarizeProposalTelemetry(proposalTelemetry);
    writeAudit(req, 200, 'Monitor summary read', auth.role);
    json(res, 200, { ok: true, summary, validatorSummary, proposalSummary });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/monitor/alerts') {
    const alerts = exportAlerts({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      limit: url.searchParams.get('limit'),
      type: url.searchParams.get('type'),
    });
    writeAudit(req, 200, `Monitor alerts read count=${alerts.length}`, auth.role);
    json(res, 200, { ok: true, alerts });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/monitor/validators') {
    const events = exportValidatorTelemetry({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      limit: url.searchParams.get('limit'),
      validatorId: url.searchParams.get('validatorId'),
    });
    const summary = summarizeValidatorTelemetry(events);
    writeAudit(req, 200, `Monitor validators read count=${events.length}`, auth.role);
    json(res, 200, { ok: true, summary, events });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/monitor/proposals') {
    const events = exportProposalTelemetry({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      limit: url.searchParams.get('limit'),
      proposalId: url.searchParams.get('proposalId'),
      validatorId: url.searchParams.get('validatorId'),
      action: url.searchParams.get('action'),
    });
    const summary = summarizeProposalTelemetry(events);
    writeAudit(req, 200, `Monitor proposals read count=${events.length}`, auth.role);
    json(res, 200, { ok: true, summary, events });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/monitor/proposals') {
    const body = await readBody(req);
    const event = await appendProposalTelemetry({
      proposalId: body.proposalId,
      proposalType: body.proposalType,
      validatorId: body.validatorId,
      action: body.action,
      status: body.status || 'success',
      txHash: body.txHash,
      reason: body.reason,
    });
    writeAudit(req, 200, `Proposal telemetry appended proposalId=${event?.proposalId || 'deduped'}`, auth.role);
    json(res, 200, { ok: true, event });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/monitor/proposals/sync') {
    const body = await readBody(req);
    const parsedFromBlock = body.fromBlock === undefined ? undefined : Number(body.fromBlock);
    const parsedToBlock = body.toBlock === undefined ? undefined : Number(body.toBlock);
    const syncResult = await syncProposalEventsFromChain({
      rpcUrl: body.rpcUrl,
      contractAddress: body.contractAddress,
      fromBlock: Number.isFinite(parsedFromBlock) ? parsedFromBlock : undefined,
      toBlock: Number.isFinite(parsedToBlock) ? parsedToBlock : undefined,
    });
    writeAudit(req, 200, `Chain proposal sync count=${syncResult.events.length}`, auth.role);
    json(res, 200, {
      ok: true,
      fromBlock: syncResult.fromBlock,
      toBlock: syncResult.toBlock,
      latestBlock: syncResult.latestBlock,
      synced: syncResult.events.length,
      appended: syncResult.appended,
      lastSyncedBlock: getLastSyncedBlock(body.contractAddress || validatorManagerAddress),
    });
    return true;
  }

  return false;
}

module.exports = {
  handleMonitorRoutes,
};
