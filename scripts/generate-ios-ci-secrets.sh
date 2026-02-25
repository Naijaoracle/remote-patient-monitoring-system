#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 4 ]]; then
  cat <<'USAGE'
Usage:
  scripts/generate-ios-ci-secrets.sh <path/to/cert.p12> <path/to/profile.mobileprovision> [team_id] [bundle_id]

Prints base64 values to copy into GitHub Actions secrets:
  - IOS_CERTIFICATE_P12_BASE64
  - IOS_PROVISIONING_PROFILE_BASE64
  - IOS_KEYCHAIN_PASSWORD (generated)
  - IOS_TEAM_ID (if provided)
  - IOS_BUNDLE_IDENTIFIER (if provided)

You must also set:
  - IOS_CERTIFICATE_PASSWORD (the password used when exporting the .p12)
USAGE
  exit 1
fi

CERT_PATH="$1"
PROFILE_PATH="$2"
TEAM_ID="${3:-}"
BUNDLE_ID="${4:-}"

if [[ ! -f "$CERT_PATH" ]]; then
  echo "Certificate file not found: $CERT_PATH" >&2
  exit 1
fi
if [[ ! -f "$PROFILE_PATH" ]]; then
  echo "Provisioning profile file not found: $PROFILE_PATH" >&2
  exit 1
fi

if base64 --help 2>/dev/null | grep -q -- '-w'; then
  CERT_B64="$(base64 -w 0 "$CERT_PATH")"
  PROFILE_B64="$(base64 -w 0 "$PROFILE_PATH")"
else
  CERT_B64="$(base64 < "$CERT_PATH" | tr -d '\n')"
  PROFILE_B64="$(base64 < "$PROFILE_PATH" | tr -d '\n')"
fi

KEYCHAIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"

cat <<EOF
Set these GitHub repository secrets:

IOS_CERTIFICATE_P12_BASE64
$CERT_B64

IOS_PROVISIONING_PROFILE_BASE64
$PROFILE_B64

IOS_KEYCHAIN_PASSWORD
$KEYCHAIN_PASSWORD
EOF

if [[ -n "$TEAM_ID" ]]; then
  cat <<EOF

IOS_TEAM_ID
$TEAM_ID
EOF
fi

if [[ -n "$BUNDLE_ID" ]]; then
  cat <<EOF

IOS_BUNDLE_IDENTIFIER
$BUNDLE_ID
EOF
fi

cat <<'EOF'

Also set manually:
- IOS_CERTIFICATE_PASSWORD (password for the .p12)
- Optional: IOS_EXPORT_METHOD (e.g. ad-hoc, app-store)
EOF
