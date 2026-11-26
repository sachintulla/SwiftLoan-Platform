#!/usr/bin/env bash
# WhatsApp pacing + delivery-report check (whatsapp-pacing-check.mts) against a THROWAWAY database and a fake Vox on localhost.
# Never touches swiftloan_db: creates swiftloan_wa_pacing_test from server/.env, applies the schema, runs, drops it. Nothing is sent.
#
#   cd server && bash scripts/journey/run-whatsapp-pacing.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?//; s/"$//')
case "$BASE" in *localhost*|*127.0.0.1*) ;; *) echo "refusing: DATABASE_URL in .env is not a local database"; exit 1;; esac
TEST_URL=$(echo "$BASE" | sed -E 's#/[A-Za-z0-9_]+\?#/swiftloan_wa_pacing_test?#')
ADMIN_URL=$(echo "$BASE" | sed -E 's#/[A-Za-z0-9_]+\?.*#/postgres#')
psql "$ADMIN_URL" -qc 'DROP DATABASE IF EXISTS swiftloan_wa_pacing_test' -c 'CREATE DATABASE swiftloan_wa_pacing_test'
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS swiftloan_wa_pacing_test" >/dev/null 2>&1 || true' EXIT
DATABASE_URL="$TEST_URL" npx prisma db push --skip-generate --accept-data-loss >/dev/null
psql "${TEST_URL%%\?*}" -q -c 'CREATE UNIQUE INDEX "AppDropoff_one_active_per_user" ON "AppDropoff"("userId") WHERE "status" = '"'"'active'"'"''
DATABASE_URL="$TEST_URL" SMS_PROVIDER= AURIX_AUTH_BASE_URL= AURIX_OFFERS_BASE_URL= AURIX_AUDIENCE_SECRET_CODE= REDIS_URL= \
  WHATSAPP_WEBHOOK_KEY=pacing-check-key NUDGES_DISABLED=true NODE_ENV=development node --import tsx scripts/journey/whatsapp-pacing-check.mts
