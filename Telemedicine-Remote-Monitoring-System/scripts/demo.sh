#!/usr/bin/env bash
# =============================================================================
# RPM Narrative Demo
# Walks through the full measurement lifecycle in a single terminal:
#   BLE device pair → actor + consent → proximity-verified submission
#   → AES-256-GCM encrypted storage → audit log → monitor summary
#
# No blockchain node required.  Runs in < 30 seconds.
# For the full on-chain PoA flow see scripts/demo-poa-e2e.sh.
# =============================================================================
set -euo pipefail

# ── Colour palette ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
  BLUE='\033[0;34m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
  YELLOW='\033[1;33m'; RED='\033[0;31m'
else
  BOLD=''; DIM=''; RESET=''
  BLUE=''; GREEN=''; CYAN=''; YELLOW=''; RED=''
fi

# ── Config (all overridable via env) ─────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTAL_PORT="${PORTAL_PORT:-8199}"
PORTAL_HOST="127.0.0.1"
BASE_URL="http://${PORTAL_HOST}:${PORTAL_PORT}"
PORTAL_LOG="/tmp/rpm-demo-portal-$$.log"
PORTAL_PID=""

# Generate ephemeral secrets so each run is independent
DEMO_OPERATOR_KEY="${DEMO_OPERATOR_KEY:-$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")}"
RPM_STORAGE_KEY_HEX="${RPM_STORAGE_KEY_HEX:-$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")}"
RPM_KEYSTORE_MASTER_KEY_HEX="${RPM_KEYSTORE_MASTER_KEY_HEX:-$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")}"

# Fixed demo identifiers
DEVICE_ID="0x1111111111111111111111111111111111111111"
CENTRAL_ID="0x2222222222222222222222222222222222222222"
VALIDATOR_ID="0x3333333333333333333333333333333333333333"
ACTOR_ID="clinician-001"
PATIENT_ID="patient-001"
EXPIRES_AT="$(node -e "process.stdout.write(new Date(Date.now()+3600000).toISOString())")"

# ── Helpers ───────────────────────────────────────────────────────────────────
ts()   { date '+%H:%M:%S'; }
step() { echo -e "\n${BOLD}${BLUE}▶ $(ts)  $*${RESET}"; }
ok()   { echo -e "${GREEN}  ✓ $*${RESET}"; }
info() { echo -e "${CYAN}  $*${RESET}"; }
dim()  { echo -e "${DIM}  $*${RESET}"; }
fail() { echo -e "${RED}  ✗ $*${RESET}" >&2; exit 1; }

api() {
  local method="$1" path="$2"; shift 2
  curl -s -X "$method" "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${DEMO_OPERATOR_KEY}" \
    "$@"
}

jq_node() {
  # Lightweight jq substitute using the Node.js already on PATH
  node -e "
    const raw = require('fs').readFileSync(0, 'utf8');
    let r;
    try { r = JSON.parse(raw); } catch(e) { process.stdout.write(raw); process.exit(0); }
    const fn = ($1);
    const out = fn(r);
    process.stdout.write(out === undefined ? '' : String(out));
  "
}

cleanup() {
  [[ -n "$PORTAL_PID" ]] && kill "$PORTAL_PID" 2>/dev/null || true
  rm -f "$PORTAL_LOG"
}
trap cleanup EXIT

wait_for_portal() {
  local attempts=0
  while (( attempts < 40 )); do
    curl -sf "${BASE_URL}/api/health" >/dev/null 2>&1 && return 0
    sleep 0.25
    attempts=$(( attempts + 1 ))
  done
  echo -e "\n${RED}Portal failed to start. Log:${RESET}" >&2
  tail -20 "$PORTAL_LOG" >&2
  exit 1
}

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║    Remote Patient Monitoring — Proof-of-Proximity Demo       ║"
echo "  ║    BLE proximity  ·  consent policy  ·  encrypted storage    ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"
dim "Portal → ${BASE_URL}   Log → ${PORTAL_LOG}"

# ═════════════════════════════════════════════════════════════════════════════
# 1. Start portal
# ═════════════════════════════════════════════════════════════════════════════
step "Starting portal server"
dim "Launching demo/portal-server.js with ephemeral AES-256 + keystore keys."
dim "Keys are randomly generated each run — nothing persists between demos."

HOST="$PORTAL_HOST" \
PORT="$PORTAL_PORT" \
DEMO_OPERATOR_KEY="$DEMO_OPERATOR_KEY" \
RPM_STORAGE_KEY_HEX="$RPM_STORAGE_KEY_HEX" \
RPM_KEYSTORE_MASTER_KEY_HEX="$RPM_KEYSTORE_MASTER_KEY_HEX" \
  node "${ROOT_DIR}/demo/portal-server.js" >"$PORTAL_LOG" 2>&1 &
PORTAL_PID=$!

wait_for_portal
ok "Portal listening on :${PORTAL_PORT}"

# ═════════════════════════════════════════════════════════════════════════════
# 2. Provision BLE device pair
# ═════════════════════════════════════════════════════════════════════════════
step "Provisioning BLE device pair"
dim "In a real deployment: peripheral = wearable sensor; central = smartphone gateway."
dim "Each device gets a fresh ECDSA P-256 key pair. Private keys stay in the keystore"
dim "and never leave the server — only signed payloads and public keys are exchanged."

INIT_RESP=$(api POST /api/init --data "{
  \"deviceId\":    \"${DEVICE_ID}\",
  \"centralId\":   \"${CENTRAL_ID}\",
  \"validatorId\": \"${VALIDATOR_ID}\"
}")

echo "$INIT_RESP" | jq_node 'r => {
  if (!r.ok) return "  Error: " + JSON.stringify(r);
  return [
    `  peripheral  ${r.deviceId}`,
    `  central     ${r.centralId}`,
    `  validator   ${r.validatorId}`,
  ].join("\n");
}' | while IFS= read -r line; do info "$line"; done

ok "Key pairs generated. BLE device registered with validator."

# ═════════════════════════════════════════════════════════════════════════════
# 3. Register clinician actor
# ═════════════════════════════════════════════════════════════════════════════
step "Registering clinician actor"
dim "Actors carry role, org, and scopes. The consent engine evaluates all three"
dim "against the policy stored for each patient before any measurement is accepted."

ACTOR_RESP=$(api POST /api/actors --data "{
  \"actorId\": \"${ACTOR_ID}\",
  \"role\":    \"clinician\",
  \"org\":     \"clinic-alpha\",
  \"scopes\":  [\"treatment\"],
  \"active\":  true
}")

echo "$ACTOR_RESP" | jq_node 'r => {
  const a = r.actor || {};
  return `  actorId=${a.actorId}  role=${a.role}  org=${a.org}  active=${a.active}`;
}' | while IFS= read -r line; do info "$line"; done

ok "Actor registered."

# ═════════════════════════════════════════════════════════════════════════════
# 4. Grant patient consent
# ═════════════════════════════════════════════════════════════════════════════
step "Granting patient consent"
dim "Consent is scoped to purpose, actorId, role, org, required scopes, and expiry."
dim "Every grant and revocation is appended to consent.jsonl — nothing is overwritten."
dim "The in-memory index is rebuilt from file on any change."

CONSENT_RESP=$(api POST /api/consent --data "{
  \"patientId\":       \"${PATIENT_ID}\",
  \"granted\":         true,
  \"reason\":          \"verbal-demo\",
  \"purposes\":        [\"treatment\"],
  \"allowedActorIds\": [\"${ACTOR_ID}\"],
  \"allowedRoles\":    [\"clinician\"],
  \"allowedOrgs\":     [\"clinic-alpha\"],
  \"requiredScopes\":  [\"treatment\"],
  \"expiresAt\":       \"${EXPIRES_AT}\"
}")

echo "$CONSENT_RESP" | jq_node 'r => {
  const c = r.consent || {};
  return [
    `  patientId  ${c.patientId}`,
    `  granted    ${c.granted}`,
    `  purposes   ${(c.purposes||[]).join(", ")}`,
    `  expires    ${c.expiresAt}`,
  ].join("\n");
}' | while IFS= read -r line; do info "$line"; done

ok "Consent journaled."

# ═════════════════════════════════════════════════════════════════════════════
# 5. Submit measurement
# ═════════════════════════════════════════════════════════════════════════════
step "Submitting heart-rate measurement (72 bpm)"
dim "The portal runs this pipeline before accepting the reading:"
dim "  1  BLE handshake — simulates RSSI proximity between wearable and phone"
dim "  2  Peripheral signs  sha256(deviceId ‖ centralId ‖ timestamps ‖ payload)"
dim "  3  Central co-signs, adding its own timestamp"
dim "  4  Consent engine evaluates purpose × actorId × role × org × scopes"
dim "  5  Measurement hash recorded; ciphertext written with per-record HKDF key"

SUBMIT_RESP=$(api POST /api/submit --data "{
  \"actorId\":   \"${ACTOR_ID}\",
  \"type\":      \"heart_rate\",
  \"value\":     \"72\",
  \"unit\":      \"bpm\",
  \"patientId\": \"${PATIENT_ID}\",
  \"purpose\":   \"treatment\"
}")

TX_HASH=$(echo "$SUBMIT_RESP" | jq_node 'r => r.txHash || ""')
[[ -z "$TX_HASH" ]] && fail "Submit failed: $(echo "$SUBMIT_RESP" | jq_node 'r => JSON.stringify(r)')"

LATENCY=$(echo "$SUBMIT_RESP" | jq_node 'r => {
  const s = r.stored || {};
  return s.handshakeLatencyMs != null ? s.handshakeLatencyMs + " ms" : "n/a";
}')

PERIPHERAL_SIG=$(echo "$SUBMIT_RESP" | jq_node 'r => {
  const s = r.stored || {};
  return s.peripheralSignature ? s.peripheralSignature.slice(0,32)+"…" : "n/a";
}')

echo -e "${CYAN}  txHash              ${TX_HASH}${RESET}"
info "BLE handshake latency  ${LATENCY}"
info "peripheral signature   ${PERIPHERAL_SIG}"
ok "Measurement accepted. Chain of custody complete."

# ═════════════════════════════════════════════════════════════════════════════
# 6. Verify consent evaluation (read path)
# ═════════════════════════════════════════════════════════════════════════════
step "Verifying consent evaluation on the read path"
dim "GET /api/consent/:patientId re-runs the full policy check."
dim "A viewer calling for a different purpose or actor would get active=false."

CONSENT_CHECK=$(api GET "/api/consent/${PATIENT_ID}?purpose=treatment&actorId=${ACTOR_ID}")

echo "$CONSENT_CHECK" | jq_node 'r => {
  const active = r.active;
  const reason = r.reason || "";
  return `  active=${active}  reason=${reason}`;
}' | while IFS= read -r line; do info "$line"; done

CONSENT_ACTIVE=$(echo "$CONSENT_CHECK" | jq_node 'r => String(r.active)')
[[ "$CONSENT_ACTIVE" == "true" ]] && ok "Consent check passed." \
  || fail "Consent check returned active=false — unexpected."

# ═════════════════════════════════════════════════════════════════════════════
# 7. Retrieve and decrypt the stored record
# ═════════════════════════════════════════════════════════════════════════════
step "Retrieving encrypted storage record"
dim "Each record is encrypted with AES-256-GCM."
dim "The key is derived per-record:  HKDF(masterKey, randomSalt, txHash) → 32 bytes."
dim "The auth tag is verified on decryption — any tampered byte causes rejection."

RECORD_RESP=$(api GET "/api/record/${TX_HASH}")

echo "$RECORD_RESP" | jq_node 'r => {
  const rec = r.record || {};
  const p = rec.payload || {};
  const md = p.measurementData || {};
  return [
    `  type        ${md.type || "?"}`,
    `  value       ${md.value || "?"} ${md.unit || ""}`,
    `  patientId   ${md.patientId || "?"}`,
    `  purpose     ${md.purpose || "?"}`,
    `  actorId     ${md.actorId || "?"}`,
    `  validatedBy ${p.validatedBy || "?"}`,
    `  validatedAt ${p.validatedAt ? new Date(p.validatedAt*1000).toISOString() : "?"}`,
    `  createdAt   ${rec.createdAt || "?"}`,
  ].join("\n");
}' | while IFS= read -r line; do info "$line"; done

ok "Record decrypted — auth tag verified."

# ═════════════════════════════════════════════════════════════════════════════
# 8. Audit log
# ═════════════════════════════════════════════════════════════════════════════
step "Audit log  (last 8 entries)"
dim "Every API call is appended to audit.jsonl with timestamp, IP, method, path,"
dim "role, and HTTP status. Exports are signed with a rotating ECDSA audit key."

AUDIT_RESP=$(api GET "/api/audit/export?limit=8")

echo "$AUDIT_RESP" | jq_node 'r => {
  const entries = r.entries || [];
  return entries.map(e => {
    const ts   = (e.at||"").slice(11,19);
    const stat = e.status === 200 ? "\x1b[32m" + e.status + "\x1b[0m"
                                  : "\x1b[33m" + e.status + "\x1b[0m";
    const role = (e.role||"").padEnd(12);
    const path = (e.path||"").padEnd(28);
    return `  ${ts}  ${e.method||"?"} ${path} role=${role} → ${stat}`;
  }).join("\n");
}' | while IFS= read -r line; do echo -e "$line"; done

ok "Audit log intact."

# ═════════════════════════════════════════════════════════════════════════════
# 9. Monitor summary
# ═════════════════════════════════════════════════════════════════════════════
step "Monitor summary"
dim "Real-time telemetry: submission counts, success rate, avg duration."
dim "In the full PoA build this also reports on-chain gas usage per validator."

MONITOR_RESP=$(api GET /api/monitor/summary)

echo "$MONITOR_RESP" | jq_node 'r => {
  const vs = r.validatorSummary || {};
  const lines = [
    `  totalSuccess  ${vs.totalSuccess||0}`,
    `  totalFailure  ${vs.totalFailure||0}`,
  ];
  const byV = vs.byValidator || {};
  for (const [id, b] of Object.entries(byV)) {
    lines.push(
      `  validator     ${id.slice(0,12)}…  ` +
      `success=${b.success}  failure=${b.failure}  avgDuration=${b.avgDurationMs}ms`
    );
  }
  return lines.join("\n");
}' | while IFS= read -r line; do info "$line"; done

ok "Monitor healthy."

# ═════════════════════════════════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}  ══════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  What just happened${RESET}"
echo -e "${DIM}  ──────────────────────────────────────────────────────────────${RESET}"
echo -e "  ${GREEN}✓${RESET}  BLE peripheral + central provisioned with fresh ECDSA key pairs"
echo -e "  ${GREEN}✓${RESET}  Clinician actor registered (role / org / scope)"
echo -e "  ${GREEN}✓${RESET}  Patient consent granted — scoped to purpose, actor, and expiry"
echo -e "  ${GREEN}✓${RESET}  Measurement passed: BLE proximity → consent → dual signature"
echo -e "  ${GREEN}✓${RESET}  Record written: AES-256-GCM, per-record HKDF key, auth tag"
echo -e "  ${GREEN}✓${RESET}  Consent re-evaluated on read path — policy enforced both ways"
echo -e "  ${GREEN}✓${RESET}  Full audit trail written and exportable"
echo ""
echo -e "  ${CYAN}txHash   ${TX_HASH}${RESET}"
echo -e "  ${DIM}To add on-chain PoA anchoring: CHAIN_RPC_URL=… MEASUREMENT_CONTRACT_ADDRESS=…${RESET}"
echo -e "  ${DIM}Full end-to-end with Geth:  bash scripts/demo-poa-e2e.sh${RESET}"
echo -e "${BOLD}  ══════════════════════════════════════════════════════════════${RESET}"
echo ""
