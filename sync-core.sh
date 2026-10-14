#!/usr/bin/env bash
# Rebuilds this edition from the main loader-arcade source: copies it in, then
# lays edition/ (this edition's pack, manifest and README) over it.
#
#   ./sync-core.sh [path to loader-arcade]   (default: ../loader-arcade)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
core="$(cd "${1:-$here/../loader-arcade}" && pwd)"

rsync -a --delete \
  --exclude .git --exclude edition --exclude sync-core.sh \
  --exclude .claude-plugin/types --exclude node_modules --exclude __pycache__ \
  "$core/" "$here/"
cp -a "$here/edition/." "$here/"

echo "Synced from $core ($(git -C "$core" rev-parse --short HEAD 2>/dev/null || echo 'no git'))"
npx -y tsx "$here/tools/check-pack.ts"
