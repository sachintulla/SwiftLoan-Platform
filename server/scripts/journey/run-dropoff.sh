#!/usr/bin/env bash
# Runs the drop-off job check (dropoff-check.mts) against a THROWAWAY database. Never touches swiftloan_db:
# it derives swiftloan_dropoff_test from server/.env, creates it, applies the current Prisma schema, runs the check with
# every provider switched off (nothing is sent), then drops the database.
#
#   cd server && bash scripts/journey/run-dropoff.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?//; s/"$//')
case "$BASE" in *localhost*|*127.0.0.1*) ;; *) echo "refusing: DATABASE_URL in .env is not a local database"; exit 1;; esac
TEST_URL=$(echo "$BASE" | sed -E 's#/[A-Za-z0-9_]+\?#/swiftloan_dropoff_test?#')
ADMIN_URL=$(echo "$BASE" | sed -E 's#/[A-Za-z0-9_]+\?.*#/postgres#')
psql "$ADMIN_URL" -qc 'DROP DATABASE IF EXISTS swiftloan_dropoff_test' -c 'CREATE DATABASE swiftloan_dropoff_test'
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS swiftloan_dropoff_test" >/dev/null 2>&1 || true' EXIT
DATABASE_URL="$TEST_URL" npx prisma db push --skip-generate --accept-data-loss >/dev/null
# db push cannot create the partial index (not expressible in schema.prisma); apply it as the migration does.
psql "${TEST_URL%%\?*}" -q -c 'CREATE UNIQUE INDEX "AppDropoff_one_active_per_user" ON "AppDropoff"("userId") WHERE "status" = '"'"'active'"'"''
DATABASE_URL="$TEST_URL" SMS_PROVIDER= AURIX_AUTH_BASE_URL= AURIX_OFFERS_BASE_URL= AURIX_AUDIENCE_SECRET_CODE= REDIS_URL= \
  NUDGES_DISABLED=true NODE_ENV=development bash -c '
    node --import tsx scripts/journey/dropoff-check.mts && echo "----- real send path against a fake Vox server -----" && node --import tsx scripts/journey/dropoff-send-check.mts && echo "----- the no-offers call against a fake Ello server -----" && node --import tsx scripts/journey/dropoff-call-check.mts && echo "----- per-stage schedules -----" && node --import tsx scripts/journey/stage-schedule-check.mts'
