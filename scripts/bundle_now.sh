#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${BUNDLE_OUT_DIR:-/tmp}"
mkdir -p "$OUT_DIR"

DATE="$(date +%Y-%m-%d_%H%M%S)"

HAS_GIT=0
if command -v git >/dev/null 2>&1 && [ -d "$ROOT/.git" ]; then
  HAS_GIT=1
  SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
else
  SHA="nogit"
fi

NAME="app_bundle_${DATE}_${SHA}"
STAGE="$(mktemp -d -t app_bundle_stage.XXXXXX)"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

rsync -a --delete \
  --exclude-from="$ROOT/.bundleignore" \
  "$ROOT/" "$STAGE/repo/"

mkdir -p "$STAGE/meta"
{
  echo "DATE=$DATE"
  echo "SHA=$SHA"
  echo "ROOT=$ROOT"
  echo
  if [ "$HAS_GIT" -eq 1 ]; then
    echo "== git status =="
    git status --porcelain=v1 || true
    echo
    echo "== git diff (working tree) =="
    git diff || true
    echo
    echo "== git diff (staged) =="
    git diff --cached || true
  else
    echo "== git =="
    echo "not available in this folder"
  fi
} > "$STAGE/meta/STATE.txt"

TAR_PATH="$OUT_DIR/${NAME}.tar.gz"
tar -C "$STAGE" -czf "$TAR_PATH" repo meta

echo "OK: $TAR_PATH"
ls -lah "$TAR_PATH"
