#!/usr/bin/env bash
# Smoke-tests the app-store reviewer sandbox login end to end against an API.
#   scripts/review-login-smoke.sh https://api.swiftloan.ai/api 9000000001 362832
# Uses ONLY the demo number you pass. REVIEW_LOGIN_PHONE / REVIEW_LOGIN_OTP must already be set on
# that API, otherwise the OTP request below would send a real SMS to the number.
set -u
BASE="${1:?usage: $0 <api base, e.g. https://api.swiftloan.ai/api> <phone> <otp>}"
PHONE="${2:?phone}"
OTP="${3:?otp}"
PAN="${PAN:-ABCPE1234Z}"
J='content-type: application/json'
fail() { echo "FAIL: $*" >&2; exit 1; }
field() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null; }

echo "1. request OTP for $PHONE"
R=$(curl -s -m 30 -X POST "$BASE/auth/otp/request" -H "$J" -d "{\"phone\":\"$PHONE\"}")
echo "   $R"
echo "$R" | grep -q '"otpSent":true' || fail "otp/request did not return otpSent:true"

echo "2. wrong code must be rejected"
S=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/otp/verify" -H "$J" -d "{\"phone\":\"$PHONE\",\"code\":\"000000\"}")
echo "   HTTP $S"; [ "$S" = "400" ] || fail "wrong code returned $S (expected 400)"

echo "3. demo code logs in"
V=$(curl -s -m 30 -X POST "$BASE/auth/otp/verify" -H "$J" -d "{\"phone\":\"$PHONE\",\"code\":\"$OTP\"}")
T=$(echo "$V" | field 'd["accessToken"]')
[ -n "$T" ] || fail "login failed: $V  (are REVIEW_LOGIN_PHONE / REVIEW_LOGIN_OTP set on this API and the service restarted?)"
echo "   logged in"
A="authorization: Bearer $T"

echo "4. create application"
AID=$(curl -s -m 30 -X POST "$BASE/applications" -H "$J" -H "$A" \
  -d '{"loanType":"personal","amount":300000,"tenureMonths":24,"employment":"salaried","monthlyIncome":80000}' | field 'd["application"]["id"]')
[ -n "$AID" ] || fail "could not create application"
echo "   $AID"

echo "5. PAN $PAN verifies with sample details"
P=$(curl -s -m 30 -X POST "$BASE/kyc/pan/verify" -H "$J" -H "$A" -d "{\"pan\":\"$PAN\"}")
echo "   $(echo "$P" | field 'd["message"]+" / "+d["data"]["prefill"]["fullName"]')"
echo "$P" | grep -q '"verified":true' || fail "PAN not verified: $P"
curl -s -m 30 -X PATCH "$BASE/applications/$AID" -H "$J" -H "$A" -d "{\"panNumber\":\"$PAN\"}" -o /dev/null

echo "6. offers (expect 3 'Sample Lender' offers, no partner call)"
Q=$(curl -s -m 90 -X POST "$BASE/applications/$AID/prequalify" -H "$J" -H "$A")
echo "$Q" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for o in d["offers"]:
    print("  ", o["lenderName"], "| apr", o["apr"], "| emi", o["emi"], "x", o["tenureMonths"], "| net", o["netDisbursalAmount"])
assert len(d["offers"]) == 3, "expected 3 offers"
assert all((o["lenderName"] or "").startswith("Sample Lender") for o in d["offers"]), "offers are not the sample ones"
print("   revasure:", d.get("revasure"), "| aurix:", d.get("aurixResponse"))
' || fail "prequalify did not return the sample offers: $Q"
OID=$(echo "$Q" | field 'd["offers"][0]["id"]')

echo "7. select offer, then handoff (creates the sample loan)"
curl -s -m 30 -X POST "$BASE/applications/$AID/offers/$OID/select" -H "$J" -H "$A" -d '{}' -o /dev/null -w '   select HTTP %{http_code}\n'
curl -s -m 30 -X POST "$BASE/applications/$AID/handoff" -H "$J" -H "$A" | field '"   loan "+str(d["loan"]["ref"])+" "+str(d["loan"]["status"])'

echo "8. loans list"
curl -s -m 30 "$BASE/loans" -H "$A" | field '"   "+str(len(d.get("loans", d)))+" loan(s)"'

echo "ALL CHECKS PASSED"
