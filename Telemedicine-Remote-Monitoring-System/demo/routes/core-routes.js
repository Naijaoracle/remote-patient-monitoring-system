function handleCoreRoutes(ctx) {
  const {
    req,
    res,
    url,
    auth,
    json,
    serveFile,
    writeAudit,
    state,
    measurementContractAdapterEnabled,
    chainRpcUrl,
    measurementContractAddress,
    webRootDir,
  } = ctx;

  if (req.method === 'GET' && url.pathname === '/') {
    serveFile(res, `${webRootDir}/portal.html`);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/rpm-demo.html') {
    serveFile(res, `${webRootDir}/rpm-demo.html`);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return json(res, 200, {
      ok: true,
      live: true,
      ts: new Date().toISOString(),
    }) || true;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    writeAudit(req, 200, 'Health check', auth.role);
    return json(res, 200, {
      ok: true,
      initialized: state.initialized,
      deviceId: state.deviceId,
      centralId: state.centralId,
      validatorId: state.validatorId,
      onChainAdapterEnabled: measurementContractAdapterEnabled,
      chainRpcUrl: chainRpcUrl || null,
      measurementContractAddress: measurementContractAddress || null,
    }) || true;
  }

  return false;
}

module.exports = {
  handleCoreRoutes,
};
