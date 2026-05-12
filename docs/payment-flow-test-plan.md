# Payment Flow Test Plan

## Core Paths

- Free plan user creates first canister successfully without payment intent.
- Free plan user creating second canister is blocked and prompted to choose a paid plan.
- Signature plan with card creates payment intent, confirms, and allows canister creation.
- Signature plan with voucher redeems successfully and allows canister creation.
- Legacy plan with voucher redeems successfully and allows canister creation.

## Failure and Safety Paths

- Pending payment cannot be used to create a paid canister.
- Expired payment intent cannot be used to create a paid canister.
- Payment intent from another principal is rejected.
- Reusing a consumed payment intent is rejected.
- Voucher code from another campaign tier is rejected.
- Redeeming an already-used voucher is rejected.
- Redeeming an expired voucher is rejected.
- Redeeming while campaign is paused is rejected.

## Provider Confirmation Paths

- Stripe-style payment method maps to `#stripe` provider and reaches confirmed status.
- Replayed confirmation on already-finalized intent is idempotent.

## Frontend Regression Checks

- Plan preselection from landing page (`/create?plan=...`) is reflected in create flow.
- `Seal Canister` is disabled for paid plans until payment status is confirmed.
- Free plan keeps `Seal Canister` enabled once form inputs are valid.
- Voucher prefill from landing link (`/create?voucher=...`) is reflected in the voucher input.
- Voucher payment path enables `Seal Canister` only after successful redemption.

## Validation Run (2026-04-30)

Automated checks completed for Stripe-only relay:

- `npm run build` passed after Coinbase removal.
- Relay smoke test (`npm run payments:relay`) passed:
  - `GET /health` -> `200 {"ok":true}`
  - `POST /payments/stripe/payment-intent` -> `200` with `{ id, clientSecret }`
  - no `/payments/coinbase/*` endpoints are exposed.

Manual checks still required:

- Stripe end-to-end card checkout remains unchanged in browser flow.
- Voucher path works in `/create` and reaches confirmed payment intent status without Stripe.
- Admin campaign management in `/admin/vouchers` can create, top up, pause, and resume campaigns.
