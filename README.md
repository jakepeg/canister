# Canister (ICP Time Capsule)

Canister is an Internet Computer app for creating encrypted time capsules with a React frontend and a Motoko backend.

## What this repo contains

- `src/canister_backend`: Motoko canister source (`main.mo`, the `crypto/` SHA-256 + HMAC-SHA256 modules used to verify Stripe webhook signatures, plus authorization/blob-storage mixins)
- `src/canister_frontend`: Vite + React app
- `scripts/run-with-dfx.mjs`: wrapper used by local/dev deploy scripts
- `scripts/bootstrap-payments.mjs`: idempotent script to seed `stripeWebhookSecret` on canister_backend (`local` or `ic`)
- `scripts/seed-local-vouchers.mjs`: dev-only script to create voucher campaigns + codes on the local replica
- `docs/Auth.md`: Internet Identity setup (local hosted vs `id.ai`) and troubleshooting
- `caffeine/`: original snapshot/reference app during migration

## How payments work now

There is **no Node payments relay** any more. Stripe Checkout (Payment Links) hosts the card form, and the backend canister itself receives the webhook:

1. The SPA opens a pre-created Stripe **Payment Link** in a new tab with `?client_reference_id=<paymentIntentId>`.
2. The user pays on `buy.stripe.com`. Stripe POSTs `checkout.session.completed` to `https://<backend-canister-id>.icp0.io/payments/stripe/webhook`.
3. The canister's `http_request` handler returns `upgrade=true`; the boundary node re-issues the call as `http_request_update`, which:
   - verifies the `Stripe-Signature` header against `stripeWebhookSecret` using on-canister HMAC-SHA256, with a 5-minute timestamp skew window;
   - skips the event if its `event.id` is already in `processedStripeEventIds` (idempotency);
   - extracts `client_reference_id` from the JSON body and flips the matching `paymentIntents[id].status` to `confirmed`.
4. The original SPA tab is already polling `getPaymentIntentStatus(intentId)` every ~3s, so it advances automatically.

No HTTPS outcalls, no third-party hosts, no PNA / CORS / loopback fragility. Production cycles cost is essentially zero per webhook.

## Prerequisites

- Node.js 20+
- npm 9+
- `dfx` 0.29+
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (only required if you want webhooks to reach your **local** replica)

## One-time setup

```bash
npm install
```

If you want the local payments flow to work end-to-end:

1. **Create test-mode Payment Links** in the Stripe Dashboard (test mode):
   - one for the **Signature** plan ($12), one for **Legacy** ($39);
   - on each link, set the success URL to `http://<frontend-canister-id>.localhost:4943/payment/success?session_id={CHECKOUT_SESSION_ID}` and the cancel URL to `http://<frontend-canister-id>.localhost:4943/payment/cancelled`;
   - add metadata `tier=signature` / `tier=legacy` (used as a sanity check by the webhook handler).
   - paste both `https://buy.stripe.com/test_...` URLs into `src/canister_frontend/.env.local` as `VITE_STRIPE_LINK_SIGNATURE` / `VITE_STRIPE_LINK_LEGACY`.
2. **Capture the test-mode webhook secret** (stable across `stripe listen` restarts on this machine):
   ```bash
   stripe login        # once per machine
   stripe listen --print-secret
   ```
   Paste the `whsec_...` value into `.env` as `STRIPE_WEBHOOK_SECRET=...`.

## Daily local development

```bash
npm run dev:local
```

This will:

- ensure the local replica responds to `dfx ping`; if not, `dfx stop`, kill stray `pocket-ic` temp processes, then `dfx start --clean --background` (avoids the PocketIC `400 /instances` loop after abrupt stops);
- deploy local canisters as identity `kempo`;
- copy fresh backend Candid declarations into `src/canister_frontend/src/declarations/`;
- run `scripts/bootstrap-payments.mjs` so admin + `stripeWebhookSecret` on the canister match `.env` after every deploy (the dev replica wipes access-control state on each upgrade — this script is the single source of truth);
- run `scripts/seed-local-vouchers.mjs` so the voucher campaigns are populated;
- build and deploy frontend assets;
- start the Vite dev server.

In a second terminal, forward Stripe webhooks to your local replica:

```bash
stripe listen --forward-to http://<backend-canister-id>.localhost:4943/payments/stripe/webhook
```

Then click the "Pay with Stripe" CTA in the create-capsule flow, complete a test card on Stripe, and the original tab should flip to "Payment confirmed" within a few seconds.

`Ctrl+C` in the dev terminal cleanly stops the replica + Vite. If you also need a relay-served Resend email path, run `npm run payments:relay` separately (legacy; will be replaced by canister HTTPS outcalls).

## Deploy to IC mainnet

Production frontend builds **require** valid Stripe Payment Link URLs (the build fails if `VITE_STRIPE_LINK_SIGNATURE` or `VITE_STRIPE_LINK_LEGACY` are missing, non-HTTPS, or pointing somewhere other than `buy.stripe.com` / `checkout.stripe.com`). Set them in `src/canister_frontend/.env.production` (or in the repo `.env`) before `npm run deploy:ic`.

End-to-end mainnet bring-up:

1. **Create live-mode Payment Links** in Stripe (same shape as test mode, but with `https://canister.co/payment/success?session_id={CHECKOUT_SESSION_ID}` and `https://canister.co/payment/cancelled`).
2. **Register the live webhook endpoint**: `https://<backend-canister-id>.icp0.io/payments/stripe/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Copy the live signing secret.
3. **Deploy the backend** (this carries `http_request` + the HMAC-SHA256 verifier):
   ```bash
   npm run deploy:ic
   ```
4. **Seed the live webhook secret** on canister_backend:
   ```bash
   npm run payments:bootstrap:ic -- --secret whsec_live_xxx
   ```
   The default `bootstrap-admin` identity is plaintext; replace with whatever dfx identity holds admin on canister_backend.
5. **Deploy the frontend** (with `VITE_STRIPE_LINK_*` set to the live URLs). `npm run deploy:ic` builds + uploads.
6. **Smoke-test** with a real card on canister.co and confirm the canister flips the intent to `confirmed`.

## Useful scripts

- `npm run dev:local`: local replica + local deploy + bootstrap + voucher seed + Vite
- `npm run deploy:ic`: deploy backend/frontend to IC
- `npm run payments:bootstrap`: re-seed the Stripe webhook secret on the local canister (also runs as part of `dev:local`)
- `npm run payments:bootstrap:ic`: same, against mainnet — defaults to the `bootstrap-admin` identity, accepts `--secret <whsec_...>`
- `npm run vouchers:seed:local`: re-create voucher campaigns/codes on the local replica
- `npm run build`: build frontend workspace

## Payments env

Repo `.env` (read by `bootstrap-payments.mjs` and the legacy email relay):

- `BACKEND_CANISTER_ID`, `BACKEND_HOST`
- `STRIPE_WEBHOOK_SECRET` (the value from `stripe listen --print-secret`; live mode value goes in via `--secret` rather than committed)
- `RESEND_*` (only relevant while the email relay still exists)

Frontend `src/canister_frontend/.env.local` (dev) / `.env.production` (prod):

- `VITE_STRIPE_LINK_SIGNATURE` — `https://buy.stripe.com/test_xxx` or `https://buy.stripe.com/yyy`
- `VITE_STRIPE_LINK_LEGACY` — same shape

Create-flow payment tabs:

- **Credit card**: opens the Stripe Payment Link in a new tab (`<a target="_blank">`).
- **Crypto**: disabled placeholder ("Coming soon").
- **Voucher**: redeems a backend-issued code; remains usable in test mode via `seed-local-vouchers.mjs`.

## Troubleshooting payments

- **Webhook returns 503 "Stripe webhook secret not configured"**: run `npm run payments:bootstrap` (local) or `npm run payments:bootstrap:ic -- --secret <whsec_...>` (mainnet) to seed `stripeWebhookSecret`. Confirm with `dfx canister call canister_backend _paymentsConfigured '("stripe")'`.
- **Webhook returns 400 "Bad signature"**: the canister-stored secret does not match what Stripe is signing with. For local: re-run `stripe listen --print-secret`, update `.env`, re-run `npm run payments:bootstrap`. For mainnet: re-pull the value from the Stripe Dashboard webhook, re-run `payments:bootstrap:ic --secret <new>`.
- **Webhook returns 400 with stale-timestamp body**: clock skew >5 minutes between Stripe and the canister's view of `Time.now()`. Check the host's NTP.
- **Stripe Payment Link not configured for this plan**: the SPA prints this when `VITE_STRIPE_LINK_<TIER>` is missing for the selected plan. Add it to `.env.local` and rebuild/restart Vite.
- **Original tab does not advance after payment**: confirm `stripe listen` is forwarding to the **backend** canister (not the frontend canister); confirm `getPaymentIntentStatus(intentId)` flips to `confirmed` via `dfx canister call`.

## Identity defaults

- local (`npm run dev:local`): `kempo`
- IC (`npm run deploy:ic`): `motoko`

Override if needed:

- `DFX_LOCAL_IDENTITY=<name> npm run dev:local`
- `DFX_IC_IDENTITY=<name> npm run deploy:ic`

## Auth and Internet Identity

See `docs/Auth.md` for:

- local Internet Identity pin/version details
- hosted identity (`https://id.ai`) behavior
- troubleshooting for common auth/deploy errors

