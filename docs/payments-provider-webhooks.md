# Provider Webhook Setup

This project confirms paid canister creation using backend payment intents.

## Required environment variables

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CHECKOUT_BASE_URL`
- `BACKEND_CANISTER_ID`
- `BACKEND_HOST`
- `VITE_PAYMENTS_RELAY_BASE_URL` (frontend -> relay base URL)

## Stripe-first mode

For Stripe-only rollout first:

- Leave `VITE_ENABLE_COINBASE_CHECKOUT` unset (or set to `false`).
- Do not configure Coinbase env vars yet.
- Only expose Stripe webhook destination:
  - `/payments/stripe/webhook`

## Coinbase (phase 2)

Add these when enabling Coinbase:

- `COINBASE_WEBHOOK_SECRET`
- `COINBASE_CHECKOUT_BASE_URL`
- `COINBASE_COMMERCE_API_KEY` (required for Coinbase charge creation)
- `VITE_ENABLE_COINBASE_CHECKOUT=true`

## Relay endpoints

The relay service (`services/payments-relay/server.mjs`) exposes:

- `POST /payments/stripe/checkout-session`
- `POST /payments/stripe/webhook`
- `POST /payments/coinbase/charge`
- `POST /payments/coinbase/webhook`

## Webhook confirmation contract

For both Stripe and Coinbase, your webhook handler should call backend
`confirmPaymentIntent(intentId, providerPaymentId, targetStatus, webhookSecret)`.

- `intentId`: internal payment intent id from metadata.
- `providerPaymentId`: must match the stored provider id.
- `targetStatus`: typically `confirmed`, `failed`, or `expired`.
- `webhookSecret`: provider-specific secret configured in backend env.

## Stripe event mapping

- `checkout.session.completed` -> `confirmed`
- `checkout.session.async_payment_failed` -> `failed`
- `checkout.session.expired` -> `expired`

## Coinbase event mapping

- `charge:confirmed` -> `confirmed`
- `charge:failed` -> `failed`
- `charge:expired` -> `expired`

## Frontend behavior

- Users start checkout from the Plan step in `/create`.
- UI polls payment status.
- `Seal Canister` stays disabled for paid plans until status is `confirmed`.
