# Canister (ICP Time Capsule)

Canister is an Internet Computer app for creating encrypted time capsules with a React frontend and a Motoko backend.

## What this repo contains

- `src/canister_backend`: Motoko canister source (`main.mo` plus authorization/blob-storage mixins)
- `src/canister_frontend`: Vite + React app
- `scripts/run-with-dfx.mjs`: wrapper used by local/dev deploy scripts
- `docs/Auth.md`: Internet Identity setup (local hosted vs `id.ai`) and troubleshooting
- `caffeine/`: original snapshot/reference app during migration

## Prerequisites

- Node.js 20+
- npm 9+
- `dfx` 0.29+
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (only required if you want to exercise the payments flow locally)

## One-time setup

```bash
npm install
```

If you want the local payments flow to work end-to-end:

1. `stripe login` (one time per machine).
2. Capture the device-stable webhook signing secret:
   ```bash
   stripe listen --print-secret
   ```
   Paste the printed `whsec_...` value into `.env` as `STRIPE_WEBHOOK_SECRET=...`. This value remains stable for the life of the Stripe CLI login on this machine, so you do not need to update it on every restart of `stripe listen`.
3. Confirm `src/canister_frontend/.env.local` has the frontend dev vars (already committed defaults):
   - `VITE_PAYMENTS_RELAY_BASE_URL=http://127.0.0.1:8787`
   - `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`
   - `VITE_ENABLE_COINBASE_CHECKOUT=false`

## Daily local development

```bash
npm run dev:all
```

`npm run dev:all` orchestrates four processes in one terminal with prefixed log lines:

1. `dfx` replica + canister deploy + Vite (`npm run dev:local`)
2. Payments relay (`npm run payments:relay`) — started after the replica is reachable
3. Stripe CLI forwarder (`stripe listen --forward-to ...`) — started after the relay is healthy

`Ctrl+C` cleanly stops every child process. If you only need the frontend without payments, run `npm run dev:local` instead.

`npm run dev:local` (used standalone or as part of `dev:all`) will:

- start local `dfx` replica if needed
- deploy local canisters using identity `kempo`
- copy fresh backend Candid declarations into `src/canister_frontend/src/declarations/`
- generate `src/canister_frontend/env.json`
- build and deploy frontend assets
- start the Vite dev server

## Deploy to IC mainnet

```bash
npm run deploy:ic
```

## Useful scripts

- `npm run dev:all`: replica + frontend + payments relay + Stripe CLI forwarder in one terminal
- `npm run dev:local`: local replica + local deploy + Vite (no payments)
- `npm run payments:relay`: start Stripe/Coinbase webhook relay on its own
- `npm run deploy:ic`: deploy backend/frontend to IC
- `npm run build`: build frontend workspace

## Payments relay env

Set these in `.env` before running `npm run payments:relay` (or `dev:all`):

- `BACKEND_CANISTER_ID`
- `BACKEND_HOST`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (use the value from `stripe listen --print-secret`)

Optional:

- `PAYMENTS_RELAY_PORT` (default `8787`)
- `COINBASE_COMMERCE_API_KEY` (required for Coinbase charge creation)
- `COINBASE_WEBHOOK_SECRET` (required only when enabling Coinbase webhook handling)

Frontend dev vars live in `src/canister_frontend/.env.local`:

- `VITE_PAYMENTS_RELAY_BASE_URL` (for example `http://127.0.0.1:8787`)
- `VITE_STRIPE_PUBLISHABLE_KEY` (matching the same Stripe test account as `STRIPE_SECRET_KEY`)
- `VITE_ENABLE_COINBASE_CHECKOUT` (`false` by default; set `true` when ready for Coinbase)

## Troubleshooting payments

- If the relay logs `No signatures found matching the expected signature for payload`, run `stripe listen --print-secret` and reconcile the value into `.env` `STRIPE_WEBHOOK_SECRET`. This typically only happens after `stripe logout` or pairing the CLI with a different account.
- If the publishable key prefix (`pk_test_51XXX`) and the secret key prefix (`sk_test_51XXX`) do not share the same `XXX` characters, they are from different Stripe test accounts and `confirmPayment` will 400.
- If the browser keeps re-confirming the same `clientSecret` and getting `payment_intent_unexpected_state`, the webhook never reached the backend. Hard-refresh the page to mint a fresh PaymentIntent on the next attempt and verify the relay log shows `status:"confirmed"`.

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

