#!/usr/bin/env bash
# Registers 10 test phone numbers + fixed OTP on the hosted Supabase project so
# phone login works without an SMS provider. See supabase/TEST-PHONE-USERS.md.
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN=sbp_xxx   # https://supabase.com/dashboard/account/tokens
#   bash supabase/scripts/set-test-phone-users.sh
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-rwavbyvdytdegntdryll}"
OTP="${OTP:-123456}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is not set. Create one at https://supabase.com/dashboard/account/tokens" >&2
  exit 1
fi

pairs=()
for i in $(seq -f "%02g" 1 10); do
  pairs+=("155500000${i}=${OTP}")
done
TEST_OTP=$(IFS=,; echo "${pairs[*]}")

echo "Setting test phone numbers on project ${PROJECT_REF}:"
echo "  ${TEST_OTP}"

curl -sS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"external_phone_enabled": true, "sms_test_otp": "%s"}' "${TEST_OTP}")" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("external_phone_enabled:", d.get("external_phone_enabled")); print("sms_test_otp:", d.get("sms_test_otp"))'

echo "Done. In the app, sign in with +1 555 000 0001 and code ${OTP}."
