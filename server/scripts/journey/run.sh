#!/usr/bin/env bash
# Runs the website drop-off recovery integration suite against a THROWAWAY database.
# Never touches swiftloan_db: it derives swiftloan_journey_test from server/.env, creates it, applies the
# current Prisma schema, runs scripts/journey/integration-suite.mts with SMS and lender calls switched off
# (the suite talks to local fake SMS/WhatsApp providers), then drops the database.
#
#   cd server && bash scripts/journey/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?//; s/"$//')
case "$BASE" in *localhost*|*127.0.0.1*) ;; *) echo "refusing: DATABASE_URL in .env is not a local database"; exit 1;; esac
TEST_URL=$(echo "$BASE" | sed -E 's#/[A-Za-z0-9_]+\?#/swiftloan_journey_test?#')
ADMIN_URL=$(echo "$BASE" | sed -E 's#/[A-Za-z0-9_]+\?.*#/postgres#')
psql "$ADMIN_URL" -qc 'DROP DATABASE IF EXISTS swiftloan_journey_test' -c 'CREATE DATABASE swiftloan_journey_test'
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS swiftloan_journey_test" >/dev/null 2>&1 || true' EXIT
DATABASE_URL="$TEST_URL" npx prisma db push --skip-generate --accept-data-loss >/dev/null
# AURIX_AUDIENCE_SECRET_CODE must be blank too: a website login pre-generates a lender (Aurix UAT) token, and a blank
# base URL alone just falls back to the real UAT host.
DATABASE_URL="$TEST_URL" SMS_PROVIDER= AURIX_AUTH_BASE_URL= AURIX_OFFERS_BASE_URL= AURIX_AUDIENCE_SECRET_CODE= INSTALL_REMINDER_SEND= REDIS_URL= \
  NUDGES_DISABLED=true DEV_MASTER_OTP= NODE_ENV=development REVIEW_LOGIN_PHONE=9345678901 REVIEW_LOGIN_OTP=654321 \
  RESULTS_FILE="${RESULTS_FILE:-/tmp/journey-suite-results.json}" \
  node --import tsx scripts/journey/integration-suite.mts
