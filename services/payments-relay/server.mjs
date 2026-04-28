import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import Stripe from "stripe";
import { Actor, HttpAgent } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";

const app = express();
app.use(cors());
app.options("*", cors());

const PORT = Number(process.env.PAYMENTS_RELAY_PORT ?? 8787);
const BACKEND_CANISTER_ID = process.env.BACKEND_CANISTER_ID;
const BACKEND_HOST = process.env.BACKEND_HOST ?? "http://127.0.0.1:4943";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
const COINBASE_WEBHOOK_SECRET = process.env.COINBASE_WEBHOOK_SECRET;

if (!BACKEND_CANISTER_ID) {
  throw new Error("BACKEND_CANISTER_ID is required");
}
if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}
if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET is required");
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

function idlFactory({ IDL }) {
  const PlanTier = IDL.Variant({
    free: IDL.Null,
    signature: IDL.Null,
    legacy: IDL.Null,
  });
  const PaymentMethod = IDL.Variant({
    card: IDL.Null,
    crypto: IDL.Null,
    voucher: IDL.Null,
  });
  const PaymentProvider = IDL.Variant({
    stripe: IDL.Null,
    coinbase: IDL.Null,
    voucher: IDL.Null,
  });
  const PaymentStatus = IDL.Variant({
    pending: IDL.Null,
    confirmed: IDL.Null,
    failed: IDL.Null,
    expired: IDL.Null,
    refunded: IDL.Null,
  });
  const PaymentIntentStatus = IDL.Record({
    id: IDL.Text,
    tier: PlanTier,
    paymentMethod: PaymentMethod,
    provider: PaymentProvider,
    amountUsdCents: IDL.Nat,
    currency: IDL.Text,
    status: PaymentStatus,
    expiresAt: IDL.Int,
    confirmedAt: IDL.Opt(IDL.Int),
    usedByCapsuleId: IDL.Opt(IDL.Nat),
    checkoutUrl: IDL.Text,
  });

  return IDL.Service({
    confirmPaymentIntent: IDL.Func(
      [IDL.Text, IDL.Text, PaymentStatus, IDL.Text],
      [PaymentIntentStatus],
      [],
    ),
  });
}

const agent = new HttpAgent({ host: BACKEND_HOST });
if (BACKEND_HOST.includes("127.0.0.1") || BACKEND_HOST.includes("localhost")) {
  try {
    await agent.fetchRootKey();
  } catch (error) {
    console.warn(
      "Unable to fetch local replica root key. Relay will start, but webhook confirmation requires backend connectivity.",
      error,
    );
  }
}

const backend = Actor.createActor(idlFactory, {
  agent,
  canisterId: BACKEND_CANISTER_ID,
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/payments/stripe/webhook", express.raw({ type: "application/json" }));
app.post("/payments/stripe/webhook", async (req, res) => {
  try {
    const signature = req.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      return res.status(400).send("Missing stripe-signature");
    }
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );

    const stripeObject = event.data.object;
    const intentId = stripeObject?.metadata?.intentId;
    if (!intentId) {
      console.info(
        JSON.stringify({
          source: "stripe-webhook",
          eventType: event.type,
          ignored: true,
          reason: "no_intent_id",
        }),
      );
      return res.status(200).json({ ignored: true, reason: "no_intent_id" });
    }

    let targetStatus = null;
    if (event.type === "payment_intent.succeeded") targetStatus = { confirmed: null };
    if (event.type === "payment_intent.payment_failed") targetStatus = { failed: null };
    if (event.type === "payment_intent.canceled") targetStatus = { expired: null };
    if (!targetStatus) {
      console.info(
        JSON.stringify({
          source: "stripe-webhook",
          eventType: event.type,
          intentId,
          ignored: true,
          reason: "unsupported_event",
        }),
      );
      return res.status(200).json({ ignored: true, reason: "unsupported_event" });
    }

    const confirmedIntent = await backend.confirmPaymentIntent(
      intentId,
      stripeObject.id,
      targetStatus,
      STRIPE_WEBHOOK_SECRET,
    );
    const status =
      confirmedIntent && typeof confirmedIntent.status === "object"
        ? Object.keys(confirmedIntent.status)[0]
        : "unknown";
    console.info(
      JSON.stringify({
        source: "stripe-webhook",
        eventType: event.type,
        intentId,
        providerPaymentId: stripeObject.id,
        status,
      }),
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "stripe-webhook",
        ok: false,
        error: String(error),
      }),
    );
    return res.status(400).json({ ok: false, error: String(error) });
  }
});

app.post("/payments/stripe/payment-intent", express.json(), async (req, res) => {
  try {
    const { intentId, amountUsdCents, planName } = req.body;
    if (!intentId || !amountUsdCents) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Number(amountUsdCents),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        intentId,
        planName: planName ?? "Canister plan",
      },
    });

    if (!paymentIntent.client_secret) {
      return res.status(400).json({ error: "Missing Stripe client secret" });
    }

    console.info(
      JSON.stringify({
        source: "stripe-payment-intent",
        intentId,
        stripePaymentIntentId: paymentIntent.id,
        amountUsdCents: Number(amountUsdCents),
      }),
    );

    return res.json({ id: paymentIntent.id, clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "stripe-payment-intent",
        ok: false,
        error: String(error),
      }),
    );
    return res.status(400).json({ error: String(error) });
  }
});

app.use("/payments/coinbase/webhook", express.raw({ type: "application/json" }));
app.post("/payments/coinbase/webhook", async (req, res) => {
  try {
    if (!COINBASE_WEBHOOK_SECRET) {
      return res.status(400).json({ error: "COINBASE_WEBHOOK_SECRET is not configured" });
    }
    const signatureHeader = req.headers["x-cc-webhook-signature"];
    if (!signatureHeader || Array.isArray(signatureHeader)) {
      return res.status(400).send("Missing x-cc-webhook-signature");
    }
    const computed = crypto
      .createHmac("sha256", COINBASE_WEBHOOK_SECRET)
      .update(req.body)
      .digest("hex");
    const signature = signatureHeader.replace(/^sha256=/, "");
    const valid =
      computed.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
    if (!valid) {
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString("utf8"));
    const intentId = event?.event?.data?.metadata?.intentId;
    const chargeCode = event?.event?.data?.code ?? event?.event?.data?.id;
    if (!intentId || !chargeCode) {
      return res.status(200).json({ ignored: true, reason: "missing_fields" });
    }

    let targetStatus = { pending: null };
    if (event?.event?.type === "charge:confirmed") targetStatus = { confirmed: null };
    if (event?.event?.type === "charge:failed") targetStatus = { failed: null };
    if (event?.event?.type === "charge:expired") targetStatus = { expired: null };

    await backend.confirmPaymentIntent(
      intentId,
      chargeCode,
      targetStatus,
      COINBASE_WEBHOOK_SECRET,
    );
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error) });
  }
});

app.post("/payments/coinbase/charge", express.json(), async (req, res) => {
  try {
    if (!COINBASE_COMMERCE_API_KEY) {
      return res.status(400).json({ error: "COINBASE_COMMERCE_API_KEY is required" });
    }
    const { intentId, amountUsdCents, planName, redirectUrl, cancelUrl } = req.body;
    if (!intentId || !amountUsdCents) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const response = await fetch("https://api.commerce.coinbase.com/charges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CC-Api-Key": COINBASE_COMMERCE_API_KEY,
        "X-CC-Version": "2018-03-22",
      },
      body: JSON.stringify({
        name: planName ?? "Canister plan",
        pricing_type: "fixed_price",
        local_price: {
          amount: (Number(amountUsdCents) / 100).toFixed(2),
          currency: "USD",
        },
        metadata: { intentId },
        redirect_url: redirectUrl,
        cancel_url: cancelUrl,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: payload });
    }

    return res.json({
      id: payload?.data?.id ?? payload?.data?.code,
      url: payload?.data?.hosted_url,
    });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Payments relay listening on http://localhost:${PORT}`);
});
