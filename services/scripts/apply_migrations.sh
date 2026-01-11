#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_URL="${DB_URL:-postgresql://postgres:postgres@localhost:5432/workshop}"

echo "Applying migrations to: $DB_URL"
psql "$DB_URL" -f "$ROOT_DIR/services/api/migrations/001_init.sql"
echo "Done."
