#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPIMAGE_PATH="${SCRIPT_DIR}/release/RAZZKINGS-0.1.0.AppImage"

if [[ ! -f "${APPIMAGE_PATH}" ]]; then
  echo "RAZZKINGS beta AppImage not found at ${APPIMAGE_PATH}" >&2
  exit 1
fi

chmod +x "${APPIMAGE_PATH}"
exec "${APPIMAGE_PATH}" "$@"