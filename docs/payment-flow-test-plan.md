# Payment Flow Test Plan

## Core Paths

- Free plan user creates first canister successfully without payment intent.
- Free plan user creating second canister is blocked and prompted to choose a paid plan.
- Signature plan with card creates payment intent, confirms, and allows canister creation.
- Legacy plan with crypto creates payment intent, confirms, and allows canister creation.

## Failure and Safety Paths

- Pending payment cannot be used to create a paid canister.
- Expired payment intent cannot be used to create a paid canister.
- Payment intent from another principal is rejected.
- Reusing a consumed payment intent is rejected.

## Provider Confirmation Paths

- Stripe-style payment method maps to `#stripe` provider and reaches confirmed status.
- Coinbase-style payment method maps to `#coinbase` provider and reaches confirmed status.
- Replayed confirmation on already-finalized intent is idempotent.

## Frontend Regression Checks

- Plan preselection from landing page (`/create?plan=...`) is reflected in create flow.
- `Seal Canister` is disabled for paid plans until payment status is confirmed.
- Free plan keeps `Seal Canister` enabled once form inputs are valid.
