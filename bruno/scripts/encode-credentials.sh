#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <cert.crt> <key.key>"
  echo ""
  echo "Base64-encodes cert and key files and prints the values."
  echo "Paste them into Bruno's environment editor (Local → certBase64, keyBase64)."
  exit 1
}

[[ $# -lt 2 ]] && usage

CERT_FILE="$1"
KEY_FILE="$2"

[[ ! -f "$CERT_FILE" ]] && echo "Error: cert file not found: $CERT_FILE" && exit 1
[[ ! -f "$KEY_FILE" ]]  && echo "Error: key file not found: $KEY_FILE"  && exit 1

CERT_B64=$(base64 -w0 "$CERT_FILE")
KEY_B64=$(base64 -w0 "$KEY_FILE")

echo "=== certBase64 ==="
echo "$CERT_B64"
echo ""
echo "=== keyBase64 ==="
echo "$KEY_B64"
echo ""
echo "Paste each value into Bruno: Local environment → click variable → paste value."
echo "Set the passphrase variable manually if your key is encrypted."
