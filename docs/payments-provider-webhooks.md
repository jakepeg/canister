# Provider Webhook Setup

Stripe webhooks are received and verified **inside the backend canister** itself; there is no Node payments relay any more. This document is the single reference for setting up Payment Links + the on-canister webhook.

## Architecture

```
Browser  ──→  buy.stripe.com (Payment Link, ?client_reference_id=<intentId>)
                              │
   (user pays)                ▼
        Stripe ──→ POST https://<backend-canister-id>.icp0.io/payments/stripe/webhook
                              │
                              ▼
   Backend canister `http_request` → upgrade=true → `http_request_update`
        ├─ HMAC-SHA256 verify of `Stripe-Signature` (5min skew window)
        ├─ idempotency check on `event.id`
        └─ flips paymentIntents[client_reference_id].status to `confirmed`
```

Key files:

- `src/canister_backend/main.mo` — `http_request` (query, upgrade) + `http_request_update`.
- `src/canister_backend/crypto/Sha256.mo` — pure Motoko SHA-256 (FIPS 180-4).
- `src/canister_backend/crypto/HmacSha256.mo` — RFC 2104 HMAC + constant-time compare.
- `src/canister_backend/crypto/JsonExtract.mo` — minimal "find-by-key" extraction over the trusted (post-verification) Stripe JSON body.

## Required environment variables

Repo `.env` (used by the bootstrap script and the legacy email relay only):

- `BACKEND_CANISTER_ID`, `BACKEND_HOST`
- `STRIPE_WEBHOOK_SECRET` — test-mode secret from `stripe listen --print-secret`. Live-mode secrets should NOT be committed; pass them via `--secret <whsec_live_...>` to `payments:bootstrap:ic`.
- `RESEND_*` — only relevant while the legacy email relay still exists.

Frontend `src/canister_frontend/.env.local` (dev) / `.env.production`:

- `VITE_STRIPE_LINK_SIGNATURE` — `https://buy.stripe.com/test_...` or `https://buy.stripe.com/...`.
- `VITE_STRIPE_LINK_LEGACY` — same shape.

The Vite production build refuses to compile if either link is missing or doesn't point at `buy.stripe.com` / `checkout.stripe.com` (see `src/canister_frontend/viteconfig.js`).

## Stripe Dashboard setup

For **each** environment (test mode + live mode):

### 1. Payment Links

- **Stripe Dashboard → Payment Links → New**.
- Pricing: one-time, fixed price; create one for the **Signature** plan ($12) and one for **Legacy** ($39).
- After creation, **edit the link** and set:
  - **Confirmation page → Don't show confirmation page → Redirect customers to your website.**
  - **Success URL**: `https://canister.co/payment/success?session_id={CHECKOUT_SESSION_ID}` (or, for local dev, `http://<frontend-canister-id>.localhost:4943/payment/success?session_id={CHECKOUT_SESSION_ID}`).
  - **Cancel URL**: `https://canister.co/payment/cancelled` (local: `http://<frontend-canister-id>.localhost:4943/payment/cancelled`).
- **Advanced → Metadata**: add `tier=signature` (or `tier=legacy`). Used as a sanity check on the canister side — not required for the flow to work.
- Copy the resulting `https://buy.stripe.com/...` URL into `VITE_STRIPE_LINK_SIGNATURE` / `VITE_STRIPE_LINK_LEGACY`.

### 2. Webhook endpoint

- **Stripe Dashboard → Developers → Webhooks → Add endpoint**.
- **URL**:
  - Live mode: `https://<backend-canister-id>.icp0.io/payments/stripe/webhook`
  - Test mode (local): use Stripe CLI forwarding instead — `stripe listen --forward-to http://<backend-canister-id>.localhost:4943/payments/stripe/webhook`. The CLI prints a `whsec_...` secret you re-use across sessions.
- **Events to send**: `checkout.session.completed`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
- **Reveal signing secret** → copy.

### 3. Configure secret on canister

```bash
# local
npm run payments:bootstrap

# mainnet (default identity is `bootstrap-admin`)
npm run payments:bootstrap:ic -- --secret whsec_live_xxx
```

Verify:

```bash
dfx canister call canister_backend _paymentsConfigured '("stripe")'
# (true)
```

## Stripe event mapping

The on-canister handler maps event types like this:

| Stripe event                              | paymentIntents[].status |
| ----------------------------------------- | ------------------------ |
| `checkout.session.completed`              | `confirmed`              |
| `checkout.session.async_payment_failed`   | `failed`                 |
| `checkout.session.expired`                | `expired`                |
| anything else                             | (acked, no state change) |

Replays of the same `event.id` short-circuit with HTTP 200 (idempotency table is `Set<Text>` in stable memory).

## Frontend behavior

- The "Pay with Stripe" CTA in `/create` opens the Payment Link in a new tab with `?client_reference_id=<paymentIntentId>`.
- The original tab polls `getPaymentIntentStatus(intentId)` every ~3s and advances when it sees `confirmed`.
- `/payment/success` and `/payment/cancelled` are static SPA pages served by the frontend asset canister.

## Local dev

```bash
npm run dev:local                # replica + deploy + bootstrap + Vite
stripe listen --forward-to \
  http://<backend-canister-id>.localhost:4943/payments/stripe/webhook
```

Smoke test from the terminal:

```bash
node - <<'EOF'
import crypto from "node:crypto";
const secret = process.env.STRIPE_WEBHOOK_SECRET;
const body = JSON.stringify({ id: "evt_t1", type: "checkout.session.completed", data: { object: { client_reference_id: "pi-fake" } } });
const t = Math.floor(Date.now()/1000);
const sig = `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const r = await fetch("http://127.0.0.1:4943/payments/stripe/webhook", {
  method: "POST",
  headers: { host: "<backend-canister-id>.localhost", "stripe-signature": sig, "content-type": "application/json" },
  body,
});
console.log(r.status, await r.text());
EOF
```

Should print `200 ok`. A second run with the same `evt_t1` should also print `200 ok` (idempotency). Tampering with the body or rotating the secret should print `400 Bad signature`.

## Production cycles cost

A canister-side webhook costs roughly the same as any small update call. For a one-time payment plan at $12–$39 you pay one HMAC-SHA256 verify (a few thousand wasm instructions) per webhook and one `paymentIntents.add` mutation. Expect <0.0001¢ in cycles per payment, including Stripe's 1–3 retries on transient errors.
