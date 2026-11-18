#!/usr/bin/env bash
# Runs the Digitap "Mobile to Prefill" check (mobile-prefill-check.mts) against a THROWAWAY database and a FAKE Digitap
# server on localhost. Never touches swiftloan_db and never calls Digitap. The database is built with
# `prisma migrate deploy`, so the 20261118120000_mobile_prefill migration itself is exercised, and the result is
# compared with schema.prisma (no drift allowed for the new table / column).
#
#   cd server && bash scripts/journey/run-mobile-prefill.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?//; s/"$//')
case "$BASE" in *localhost*|*127.0.0.1*) ;; *) echo "refusing: DATABASE_URL in .env is not a local database"; exit 1;; esac
DB=swiftloan_mobileprefill_test
TEST_URL=$(echo "$BASE" | sed -E "s#/[A-Za-z0-9_]+(\?|\$)#/$DB\1#")
ADMIN_URL=$(echo "$BASE" | sed -E 's#/[A-Za-z0-9_]+(\?.*)?$#/postgres#')
psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS '"$DB"'" >/dev/null 2>&1 || true' EXIT
DATABASE_URL="$TEST_URL" npx prisma migrate deploy >/dev/null
DRIFT=$(DATABASE_URL="$TEST_URL" npx prisma migrate diff --from-url "$TEST_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null | grep -i "MobilePrefill\|creditScore" || true)
if [ -n "$DRIFT" ]; then echo "FAIL  migration and schema.prisma disagree:"; echo "$DRIFT"; exit 1; fi
echo "PASS  migration 20261118120000_mobile_prefill matches schema.prisma"
DATABASE_URL="$TEST_URL" SMS_PROVIDER= AURIX_AUTH_BASE_URL= AURIX_OFFERS_BASE_URL= AURIX_AUDIENCE_SECRET_CODE= REDIS_URL= \
  NUDGES_DISABLED=true NODE_ENV=development DIGITAP_ENABLED=true DIGITAP_CLIENT_ID=test-id DIGITAP_CLIENT_SECRET=test-secret \
  DIGITAP_TEST_NAMES= DIGITAP_NAME_FALLBACK=0 \
  node --import tsx scripts/journey/mobile-prefill-check.mts
