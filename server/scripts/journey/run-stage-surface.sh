#!/usr/bin/env bash
# Proves the StallRule.surface migration and the engine filter against a THROWAWAY database. Never touches swiftloan_db.
#   1. build a database from the PREVIOUS schema (git: origin/develop), with a rule in it
#   2. apply the new migration SQL: the old rule becomes surface 'all', the unique key widens, a second run is harmless
#   3. check `prisma db push` finds nothing left to change (the migration matches schema.prisma)
#   4. run the engine check (stage-surface-check.mts)
#
#   cd server && bash scripts/journey/run-stage-surface.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?//; s/"$//')
case "$BASE" in *localhost*|*127.0.0.1*) ;; *) echo "refusing: DATABASE_URL in .env is not a local database"; exit 1;; esac
DB=swiftloan_surface_test
TEST_URL=$(echo "$BASE" | sed -E "s#/[A-Za-z0-9_]+\\?#/$DB?#")
ADMIN_URL=$(echo "$BASE" | sed -E 's#/[A-Za-z0-9_]+\?.*#/postgres#')
psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
OLD=$(mktemp -d)/schema.prisma
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS '$DB'" >/dev/null 2>&1 || true; rm -f "$OLD"' EXIT
git show origin/develop:server/prisma/schema.prisma > "$OLD"
DATABASE_URL="$TEST_URL" npx prisma db push --schema "$OLD" --skip-generate --accept-data-loss >/dev/null
P="${TEST_URL%%\?*}"
psql "$P" -q -c "INSERT INTO \"StallRule\"(id,name,\"triggerEvent\",\"expectedEvent\",\"delayMinutes\",\"upshotEvent\",channel,\"cooldownMinutes\",enabled,\"updatedAt\") VALUES ('old-rule','old','otp_verified','eligibility_started',5,'old_ev','push',1440,true,now())"
M=prisma/migrations/20261028120000_stall_rule_surface/migration.sql
psql "$P" -q -v ON_ERROR_STOP=1 -f "$M"
S=$(psql "$P" -Atc "SELECT surface FROM \"StallRule\" WHERE id='old-rule'")
[ "$S" = "all" ] && echo "PASS  existing rule becomes surface 'all'" || { echo "FAIL  existing rule surface=$S"; exit 1; }
psql "$P" -q -v ON_ERROR_STOP=1 -f "$M" && echo "PASS  migration is safe to run twice"
IDX=$(psql "$P" -Atc "SELECT indexname FROM pg_indexes WHERE tablename='StallRule' AND indexname LIKE 'StallRule_trigger%' ORDER BY 1")
[ "$IDX" = "StallRule_triggerEvent_expectedEvent_channel_surface_key" ] && echo "PASS  unique key is now (trigger, expected, channel, surface)" || { echo "FAIL  indexes: $IDX"; exit 1; }
DATABASE_URL="$TEST_URL" npx prisma db push --skip-generate 2>&1 | grep -q "already in sync" && echo "PASS  migration matches schema.prisma (db push has nothing to change)" || { echo "FAIL  db push still wants changes"; exit 1; }
DATABASE_URL="$TEST_URL" SMS_PROVIDER= AURIX_AUTH_BASE_URL= AURIX_OFFERS_BASE_URL= AURIX_AUDIENCE_SECRET_CODE= REDIS_URL= \
  NUDGES_DISABLED=true NODE_ENV=development node --import tsx scripts/journey/stage-surface-check.mts
