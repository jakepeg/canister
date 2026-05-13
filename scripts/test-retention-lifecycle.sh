#!/usr/bin/env bash
# Signature retention lifecycle test (Plan: profitability-safe).
# Requires: local replica running, canister deployed, kempo identity is admin.
# Time mocking: uses setTestNowOverride (admin-only).

set -uo pipefail

IDENTITY="${IDENTITY:-kempo}"
CANISTER="${CANISTER:-canister_backend}"

call() { dfx --identity "$IDENTITY" canister call "$CANISTER" "$@"; }

trap_marker() { echo "  [trap expected] $*"; }

now_ns() { echo $(($(date +%s) * 1000000000)); }

NOW=$(now_ns)
DAY_NS=$((24 * 60 * 60 * 1000000000))
UNLOCK_DAYS=10
UNLOCK_NS=$((NOW + UNLOCK_DAYS * DAY_NS))
GRACE_NS=$((30 * DAY_NS))

echo "=== STEP 0: Reset time override and quota state ==="
call setTestNowOverride "(null)" >/dev/null

echo ""
echo "=== STEP 1: Create Signature payment intent ==="
INTENT_OUTPUT=$(call createPaymentIntent '(variant { signature }, variant { card })' 2>&1)
echo "$INTENT_OUTPUT" | grep -E "(amountUsdCents|status|tier|id)" | head -8
INTENT_ID=$(echo "$INTENT_OUTPUT" | grep -E '^\s+id = "pi-' | head -1 | sed -E 's/.*"(pi-[^"]+)".*/\1/')
PROVIDER_PAYMENT_ID="stripe-${INTENT_ID}"
echo "  -> intentId: ${INTENT_ID}"

echo ""
echo "=== STEP 2: Confirm payment as admin ==="
call confirmPaymentIntent "(\"${INTENT_ID}\", \"${PROVIDER_PAYMENT_ID}\", variant { confirmed }, \"unused-secret\")" 2>&1 | grep -E "(status|confirmedAt)" | head -4

echo ""
echo "=== STEP 3: Create Signature capsule (unlock 10d out) ==="
call createCapsule "(\"public-id-sig-test-aaaaaaaa\", \"Sig Test\", \"hello\", vec {}, ${UNLOCK_NS} : int, 5 : nat, opt \"${INTENT_ID}\", false)" 2>&1 | tail -3

PUBLIC_ID="public-id-sig-test-aaaaaaaa"

echo ""
echo "=== STEP 4: Pre-unlock content access (expect trap) ==="
call getCapsuleContent "(\"${PUBLIC_ID}\")" 2>&1 | grep -E "(reject|locked|encryptedMessage)" | head -3

echo ""
echo "=== STEP 5: Fast-forward to unlock + 5 days (within 30d grace) ==="
ADVANCED1=$((UNLOCK_NS + 5 * DAY_NS))
call setTestNowOverride "(opt (${ADVANCED1} : int))" >/dev/null
call getEffectiveNow 2>&1 | tail -1
call getCapsuleContent "(\"${PUBLIC_ID}\")" 2>&1 | grep -E "(encryptedMessage|reject|locked|expired)" | head -3

echo ""
echo "=== STEP 6: Fast-forward to unlock + 31 days (past grace, expect trap) ==="
ADVANCED2=$((UNLOCK_NS + 31 * DAY_NS))
call setTestNowOverride "(opt (${ADVANCED2} : int))" >/dev/null
call getCapsuleContent "(\"${PUBLIC_ID}\")" 2>&1 | grep -E "(encryptedMessage|reject|expired)" | head -3

echo ""
echo "=== STEP 7: Profitability snapshot reflects expired signature ==="
call getProfitabilitySnapshot 2>&1 | grep -E "(signatureCapsules|activeSignatureCapsules|expiredSignatureCapsules)" | head -6

echo ""
echo "=== STEP 8: Run purgeExpiredSignatureCapsules (expect 1 purged) ==="
call purgeExpiredSignatureCapsules 2>&1 | tail -3

echo ""
echo "=== STEP 9: Reset time override ==="
call setTestNowOverride "(null)" >/dev/null
call getEffectiveNow 2>&1 | tail -1

echo ""
echo "=== Done ==="
