import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import Stripe from "stripe";
import { Resend } from "resend";
import { Actor, HttpAgent } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, "src", "canister_frontend", ".env.local") });

const app = express();
app.use(cors());
app.options("*", cors());

const PORT = Number(process.env.PAYMENTS_RELAY_PORT ?? 8787);
const BACKEND_CANISTER_ID = process.env.BACKEND_CANISTER_ID;
const BACKEND_HOST = process.env.BACKEND_HOST ?? "http://127.0.0.1:4943";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "";
const RESEND_REPLY_TO = process.env.RESEND_REPLY_TO ?? "";
const RESEND_UNSUBSCRIBE_BASE_URL =
  process.env.RESEND_UNSUBSCRIBE_BASE_URL ??
  process.env.VITE_PAYMENTS_RELAY_BASE_URL ??
  "";
const RESEND_UNSUBSCRIBE_SECRET = process.env.RESEND_UNSUBSCRIBE_SECRET ?? "";

if (!BACKEND_CANISTER_ID) {
  throw new Error("BACKEND_CANISTER_ID is required");
}
if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}
if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET is required");
}

if (!process.env.VITE_STRIPE_PUBLISHABLE_KEY) {
  console.warn(
    "[payments-relay] VITE_STRIPE_PUBLISHABLE_KEY is not set in loaded env files (Vite reads src/canister_frontend/.env.local). The browser Stripe form may not load.",
  );
}
if (!process.env.VITE_PAYMENTS_RELAY_BASE_URL) {
  console.warn(
    "[payments-relay] VITE_PAYMENTS_RELAY_BASE_URL is not set (e.g. http://127.0.0.1:8787). The frontend may POST to the wrong origin.",
  );
}

const stripe = new Stripe(STRIPE_SECRET_KEY);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const resendConfigured = Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);
if (!resendConfigured) {
  console.warn(
    "[payments-relay] Resend is not fully configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL for live email sending.",
  );
}
if (!RESEND_UNSUBSCRIBE_SECRET) {
  console.warn(
    "[payments-relay] RESEND_UNSUBSCRIBE_SECRET is not set. Unsubscribe links cannot be generated securely.",
  );
}

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
    ownerEmail: IDL.Opt(IDL.Text),
  });
  const ReminderTarget = IDL.Variant({
    owner: IDL.Null,
    other: IDL.Null,
  });
  const NotificationPreferences = IDL.Record({
    ownerEmail: IDL.Text,
    recipientEmail: IDL.Opt(IDL.Text),
    reminderTarget: ReminderTarget,
    reminderOptIn: IDL.Bool,
    marketingOptIn: IDL.Bool,
    notifyRecipientOnCreation: IDL.Bool,
    hasRecipientPermission: IDL.Bool,
    reminderConsentAt: IDL.Opt(IDL.Int),
    marketingConsentAt: IDL.Opt(IDL.Int),
    creationNoticeSentAt: IDL.Opt(IDL.Int),
    unlockReminderSentAt: IDL.Opt(IDL.Int),
    expiryReminderSentAt: IDL.Opt(IDL.Int),
    updatedAt: IDL.Int,
  });

  return IDL.Service({
    getPaymentIntentStatusForProvider: IDL.Func(
      [IDL.Text, IDL.Text],
      [PaymentIntentStatus],
      [],
    ),
    confirmPaymentIntent: IDL.Func(
      [IDL.Text, IDL.Text, PaymentStatus, IDL.Text],
      [PaymentIntentStatus],
      [],
    ),
    getPaymentIntentStatus: IDL.Func([IDL.Text], [PaymentIntentStatus], []),
    setPaymentIntentOwnerEmailFromProvider: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text],
      [],
      [],
    ),
    getPaymentNotificationPreferencesForProvider: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Opt(NotificationPreferences)],
      [],
    ),
    markCreationNoticeSentForProvider: IDL.Func([IDL.Text, IDL.Text], [], []),
    markUnlockReminderSentForProvider: IDL.Func([IDL.Text, IDL.Text], [], []),
    markExpiryReminderSentForProvider: IDL.Func([IDL.Text, IDL.Text], [], []),
    setMarketingOptInByOwnerEmailForProvider: IDL.Func(
      [IDL.Text, IDL.Bool, IDL.Text],
      [IDL.Nat],
      [],
    ),
    verifyPaymentWebhookSecret: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Bool],
      ["query"],
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

function createUnsubscribeToken(email) {
  const normalized = String(email).trim().toLowerCase();
  const payload = Buffer.from(normalized).toString("base64url");
  const signature = crypto
    .createHmac("sha256", RESEND_UNSUBSCRIBE_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function parseAndVerifyUnsubscribeToken(token) {
  if (!token || !RESEND_UNSUBSCRIBE_SECRET) return null;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return null;
  const expected = crypto
    .createHmac("sha256", RESEND_UNSUBSCRIBE_SECRET)
    .update(payload)
    .digest("base64url");
  if (expected !== signature) return null;
  const email = Buffer.from(payload, "base64url").toString("utf8").trim().toLowerCase();
  if (!email.includes("@")) return null;
  return email;
}

function renderSupportFooter() {
  return `<p style="color:#6b7280;font-size:12px;line-height:1.5;">You are receiving this email because of your Time Canister notification preferences. If this looks wrong, reply to this email for support.</p>`;
}

function renderCreationNoticeTemplate({ recipientEmail, intentId }) {
  const subject = "A Time Canister has been created for you";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#111827;">A Time Canister was created with your email as recipient</h2>
    <p style="color:#374151;">You may receive unlock reminders for this capsule in the future.</p>
    <p style="color:#374151;">Reference: <strong>${intentId}</strong></p>
    ${renderSupportFooter()}
  </div>`;
  const text = `A Time Canister was created with your email as recipient.\nYou may receive unlock reminders for this capsule in the future.\nReference: ${intentId}\n`;
  return { to: recipientEmail, subject, html, text };
}

function renderUnlockReminderTemplate({ to, capsuleId, unlockAt }) {
  const subject = "Your Time Canister unlock date is near";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#111827;">Unlock reminder</h2>
    <p style="color:#374151;">Your scheduled unlock date is approaching.</p>
    <p style="color:#374151;">Capsule: <strong>${capsuleId ?? "n/a"}</strong><br/>Unlock time: <strong>${unlockAt ?? "n/a"}</strong></p>
    ${renderSupportFooter()}
  </div>`;
  const text = `Unlock reminder.\nCapsule: ${capsuleId ?? "n/a"}\nUnlock time: ${unlockAt ?? "n/a"}\n`;
  return { to, subject, html, text };
}

function renderExpiryReminderTemplate({ to, capsuleId, expiresAt }) {
  const subject = "Reminder: Signature content availability window";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#111827;">Signature expiry reminder</h2>
    <p style="color:#374151;">This is a reminder that Signature plan content availability expires after the post-unlock grace window.</p>
    <p style="color:#374151;">Capsule: <strong>${capsuleId ?? "n/a"}</strong><br/>Expiry time: <strong>${expiresAt ?? "n/a"}</strong></p>
    ${renderSupportFooter()}
  </div>`;
  const text = `Signature expiry reminder.\nCapsule: ${capsuleId ?? "n/a"}\nExpiry time: ${expiresAt ?? "n/a"}\n`;
  return { to, subject, html, text };
}

function renderMarketingTemplate({ ownerEmail, campaignSubject, campaignText }) {
  const token = createUnsubscribeToken(ownerEmail);
  const unsubscribeUrl = `${RESEND_UNSUBSCRIBE_BASE_URL}/notifications/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
  const subject = campaignSubject ?? "Updates from Time Canister";
  const bodyText = campaignText ?? "Thanks for being part of Time Canister. We have new updates to share.";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#111827;">${subject}</h2>
    <p style="color:#374151;white-space:pre-wrap;">${bodyText}</p>
    <p style="color:#6b7280;font-size:12px;">To stop marketing emails, unsubscribe here: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p>
  </div>`;
  const text = `${subject}\n\n${bodyText}\n\nUnsubscribe: ${unsubscribeUrl}\n`;
  return { to: ownerEmail, subject, html, text };
}

async function sendEmailWithResend({ to, subject, html, text, tags = [] }) {
  if (!resendConfigured || !resend) {
    throw new Error("Resend is not configured");
  }
  const response = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject,
    html,
    text,
    reply_to: RESEND_REPLY_TO || undefined,
    tags,
  });
  if (response?.error) {
    throw new Error(String(response.error?.message ?? "Unknown Resend error"));
  }
  return response?.data?.id ?? null;
}

// Startup self-test: verify the Stripe webhook secret on the canister matches
// the value the relay was started with. This is a true-positive check (false
// means the canister is unconfigured or out of sync) so a missing
// `configurePaymentWebhookSecrets` call cannot silently look healthy.
try {
  const matches = await backend.verifyPaymentWebhookSecret(
    "stripe",
    STRIPE_WEBHOOK_SECRET,
  );
  if (matches) {
    console.info(
      JSON.stringify({
        source: "payments-relay-selftest",
        ok: true,
        detail: "stripe webhook secret on canister matches STRIPE_WEBHOOK_SECRET",
      }),
    );
  } else {
    console.error(
      "\x1b[31m[payments-relay] FATAL: Backend canister has no Stripe webhook secret configured, or it does not match STRIPE_WEBHOOK_SECRET.\x1b[0m",
    );
    console.error(
      "Run as an admin identity:\n  dfx canister call canister_backend configurePaymentWebhookSecrets '(opt \"<STRIPE_WEBHOOK_SECRET>\", null)'",
    );
    process.exit(1);
  }
} catch (error) {
  const msg = String(error);
  if (
    msg.includes("has no query method") ||
    msg.includes("has no update method") ||
    (msg.includes("not found") && msg.includes("verifyPaymentWebhookSecret"))
  ) {
    console.error(
      "\x1b[31m[payments-relay] FATAL: Backend canister is missing verifyPaymentWebhookSecret. Redeploy the canister: `npm run dev:local` (or `dfx deploy canister_backend`).\x1b[0m",
    );
    console.error(msg);
    process.exit(1);
  }
  console.error(
    "\x1b[31m[payments-relay] FATAL: Self-test call to canister failed (replica down, wrong BACKEND_CANISTER_ID, or network).\x1b[0m",
  );
  console.error(msg);
  process.exit(1);
}

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
    if (event.type === "payment_intent.succeeded") {
      const payerEmail =
        stripeObject?.receipt_email ??
        stripeObject?.charges?.data?.[0]?.billing_details?.email ??
        null;
      if (payerEmail) {
        await backend.setPaymentIntentOwnerEmailFromProvider(
          intentId,
          payerEmail,
          STRIPE_WEBHOOK_SECRET,
        );
      }
    }
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
    const { intentId, planName } = req.body;
    if (!intentId) {
      return res.status(400).json({ error: "Missing required intentId" });
    }

    const intent = await backend.getPaymentIntentStatusForProvider(
      intentId,
      STRIPE_WEBHOOK_SECRET,
    );
    const provider =
      intent && typeof intent.provider === "object"
        ? Object.keys(intent.provider)[0]
        : "unknown";
    const status =
      intent && typeof intent.status === "object" ? Object.keys(intent.status)[0] : "unknown";
    if (provider !== "stripe") {
      return res.status(400).json({ error: "Intent is not configured for Stripe" });
    }
    if (status !== "pending") {
      return res.status(400).json({ error: `Intent is not payable (status: ${status})` });
    }

    const trustedAmountUsdCents = Number(intent.amountUsdCents);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: trustedAmountUsdCents,
      currency: "usd",
      payment_method_types: ["card"],
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
        amountUsdCents: trustedAmountUsdCents,
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

app.post("/notifications/recipient-created", express.json(), async (req, res) => {
  try {
    const { intentId } = req.body ?? {};
    if (!intentId) {
      return res.status(400).json({ error: "Missing required intentId" });
    }

    const prefsResult = await backend.getPaymentNotificationPreferencesForProvider(
      intentId,
      STRIPE_WEBHOOK_SECRET,
    );
    const prefs = prefsResult?.[0];
    if (!prefs) {
      return res.json({ ok: true, sent: false, reason: "no_preferences" });
    }
    const reminderTarget =
      prefs && typeof prefs.reminderTarget === "object"
        ? Object.keys(prefs.reminderTarget)[0]
        : "owner";
    const recipientEmail = prefs.recipientEmail?.[0];
    const shouldSend =
      prefs.reminderOptIn &&
      prefs.notifyRecipientOnCreation &&
      reminderTarget === "other" &&
      Boolean(recipientEmail);

    if (!shouldSend) {
      return res.json({ ok: true, sent: false, reason: "disabled_by_preferences" });
    }

    const payload = renderCreationNoticeTemplate({ recipientEmail, intentId });
    const providerMessageId = await sendEmailWithResend({
      ...payload,
      tags: [
        { name: "email_type", value: "creation_notice" },
        { name: "intent_id", value: intentId },
      ],
    });
    await backend.markCreationNoticeSentForProvider(intentId, STRIPE_WEBHOOK_SECRET);
    return res.json({ ok: true, sent: true, providerMessageId });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

app.post("/notifications/reminder-unlock", express.json(), async (req, res) => {
  try {
    const { intentId, capsuleId, unlockAt } = req.body ?? {};
    if (!intentId) {
      return res.status(400).json({ error: "Missing required intentId" });
    }
    const prefsResult = await backend.getPaymentNotificationPreferencesForProvider(
      intentId,
      STRIPE_WEBHOOK_SECRET,
    );
    const prefs = prefsResult?.[0];
    if (!prefs?.reminderOptIn) {
      return res.json({ ok: true, sent: false, reason: "reminders_not_opted_in" });
    }
    if (prefs.unlockReminderSentAt?.length) {
      return res.json({ ok: true, sent: false, reason: "already_sent" });
    }
    const reminderTarget =
      prefs && typeof prefs.reminderTarget === "object"
        ? Object.keys(prefs.reminderTarget)[0]
        : "owner";
    const destination =
      reminderTarget === "other" ? prefs.recipientEmail?.[0] ?? null : prefs.ownerEmail;
    if (!destination) {
      return res.json({ ok: true, sent: false, reason: "no_destination" });
    }
    const payload = renderUnlockReminderTemplate({ to: destination, capsuleId, unlockAt });
    const providerMessageId = await sendEmailWithResend({
      ...payload,
      tags: [
        { name: "email_type", value: "unlock_reminder" },
        { name: "intent_id", value: intentId },
      ],
    });
    await backend.markUnlockReminderSentForProvider(intentId, STRIPE_WEBHOOK_SECRET);
    return res.json({ ok: true, sent: true, providerMessageId });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

app.post("/notifications/reminder-expiry", express.json(), async (req, res) => {
  try {
    const { intentId, capsuleId, expiresAt } = req.body ?? {};
    if (!intentId) {
      return res.status(400).json({ error: "Missing required intentId" });
    }
    const prefsResult = await backend.getPaymentNotificationPreferencesForProvider(
      intentId,
      STRIPE_WEBHOOK_SECRET,
    );
    const prefs = prefsResult?.[0];
    if (!prefs?.reminderOptIn) {
      return res.json({ ok: true, sent: false, reason: "reminders_not_opted_in" });
    }
    if (prefs.expiryReminderSentAt?.length) {
      return res.json({ ok: true, sent: false, reason: "already_sent" });
    }
    const reminderTarget =
      prefs && typeof prefs.reminderTarget === "object"
        ? Object.keys(prefs.reminderTarget)[0]
        : "owner";
    const destination =
      reminderTarget === "other" ? prefs.recipientEmail?.[0] ?? null : prefs.ownerEmail;
    if (!destination) {
      return res.json({ ok: true, sent: false, reason: "no_destination" });
    }
    const payload = renderExpiryReminderTemplate({ to: destination, capsuleId, expiresAt });
    const providerMessageId = await sendEmailWithResend({
      ...payload,
      tags: [
        { name: "email_type", value: "expiry_reminder" },
        { name: "intent_id", value: intentId },
      ],
    });
    await backend.markExpiryReminderSentForProvider(intentId, STRIPE_WEBHOOK_SECRET);
    return res.json({ ok: true, sent: true, providerMessageId });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

app.post("/notifications/marketing/send", express.json(), async (req, res) => {
  try {
    const { intentId, subject, text } = req.body ?? {};
    if (!intentId) {
      return res.status(400).json({ error: "Missing required intentId" });
    }
    const prefsResult = await backend.getPaymentNotificationPreferencesForProvider(
      intentId,
      STRIPE_WEBHOOK_SECRET,
    );
    const prefs = prefsResult?.[0];
    if (!prefs) {
      return res.json({ ok: true, sent: false, reason: "no_preferences" });
    }
    if (!prefs.marketingOptIn) {
      return res.json({ ok: true, sent: false, reason: "marketing_not_opted_in" });
    }
    const payload = renderMarketingTemplate({
      ownerEmail: prefs.ownerEmail,
      campaignSubject: subject,
      campaignText: text,
    });
    const providerMessageId = await sendEmailWithResend({
      ...payload,
      tags: [
        { name: "email_type", value: "marketing" },
        { name: "intent_id", value: intentId },
      ],
    });
    return res.json({ ok: true, sent: true, providerMessageId });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

app.get("/notifications/marketing/unsubscribe", async (req, res) => {
  try {
    const token = req.query.token;
    const email = parseAndVerifyUnsubscribeToken(token);
    if (!email) {
      return res.status(400).send("Invalid unsubscribe link.");
    }
    await backend.setMarketingOptInByOwnerEmailForProvider(email, false, STRIPE_WEBHOOK_SECRET);
    return res.send("You have been unsubscribed from Time Canister marketing emails.");
  } catch (error) {
    return res.status(400).send(`Unsubscribe failed: ${String(error)}`);
  }
});

app.listen(PORT, () => {
  console.log(`Payments relay listening on http://localhost:${PORT}`);
});
