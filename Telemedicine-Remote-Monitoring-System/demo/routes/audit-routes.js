async function handleAuditRoutes(ctx) {
  const {
    req,
    res,
    url,
    auth,
    json,
    readBody,
    writeAudit,
    exportAuditEntries,
    createSignedAuditPackageFromRequest,
    loadAuditKeyHistory,
    getActiveAuditSigningKey,
    rotateAuditSigner,
  } = ctx;

  if (req.method === 'GET' && url.pathname === '/api/audit/export') {
    const entries = exportAuditEntries({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      limit: url.searchParams.get('limit'),
    });
    writeAudit(req, 200, `Audit export count=${entries.length}`, auth.role);
    json(res, 200, { ok: true, entries });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/audit/package') {
    const exportPackage = await createSignedAuditPackageFromRequest(url);
    writeAudit(req, 200, `Audit package exported count=${exportPackage.manifest.entryCount}`, auth.role);
    json(res, 200, { ok: true, exportPackage });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/audit/keys') {
    const keys = loadAuditKeyHistory();
    const active = getActiveAuditSigningKey();
    writeAudit(req, 200, `Audit key history read count=${keys.length}`, auth.role);
    json(res, 200, { ok: true, active, keys });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/audit/rotate-key') {
    const body = await readBody(req);
    const rotation = rotateAuditSigner(String(body.reason || 'manual'));
    writeAudit(req, 200, `Audit key rotated keyId=${rotation.keyId}`, auth.role);
    json(res, 200, { ok: true, ...rotation });
    return true;
  }

  return false;
}

module.exports = {
  handleAuditRoutes,
};
