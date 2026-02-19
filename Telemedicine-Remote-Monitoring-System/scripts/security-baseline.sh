#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${ROOT_DIR}/reports/security"
mkdir -p "${REPORT_DIR}"

run_audit() {
  local target_dir="$1"
  local target_name="$2"
  local output_file="${REPORT_DIR}/${target_name}-audit.json"

  if [[ ! -f "${target_dir}/package-lock.json" ]]; then
    printf '{"name":"%s","skipped":"missing package-lock.json"}\n' "${target_name}" > "${output_file}"
    echo "Skipped npm audit for ${target_name} (no package-lock.json)"
    return 0
  fi

  echo "Running npm audit for ${target_name}..."
  (
    cd "${target_dir}"
    npm audit --json > "${output_file}" || true
  )
}

echo "Running secret-pattern scan..."
if command -v rg >/dev/null 2>&1; then
  rg -n --hidden --glob '!**/node_modules/**' --glob '!**/.data/**' --glob '!**/.git/**' \
    'BEGIN (EC|RSA|PRIVATE) KEY|mnemonic|PRIVATE_KEY|HDWALLET' \
    "${ROOT_DIR}" > "${REPORT_DIR}/secret-patterns.txt" || true
else
  echo "rg not found; secret-pattern scan skipped." > "${REPORT_DIR}/secret-patterns.txt"
fi

run_audit "${ROOT_DIR}" "root"
run_audit "${ROOT_DIR}/smart-contracts" "smart-contracts"

node "${ROOT_DIR}/scripts/summarize-audit.js" "${REPORT_DIR}"

if [[ "${SECURITY_FAIL_ON_CRITICAL:-0}" == "1" ]]; then
  CRITICAL_COUNT="$(node "${ROOT_DIR}/scripts/summarize-audit.js" "${REPORT_DIR}" --critical-only)"
  if [[ "${CRITICAL_COUNT}" != "0" ]]; then
    echo "Critical vulnerabilities detected: ${CRITICAL_COUNT}" >&2
    exit 1
  fi
fi

if [[ "${SECURITY_FAIL_ON_AUDIT_ERROR:-0}" == "1" ]]; then
  AUDIT_ERROR_COUNT="$(node "${ROOT_DIR}/scripts/summarize-audit.js" "${REPORT_DIR}" --error-count)"
  if [[ "${AUDIT_ERROR_COUNT}" != "0" ]]; then
    echo "Audit execution errors detected: ${AUDIT_ERROR_COUNT}" >&2
    exit 1
  fi
fi

echo "Security baseline completed. Reports in ${REPORT_DIR}"
