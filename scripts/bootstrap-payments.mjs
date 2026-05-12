#!/usr/bin/env node
/**
 * Idempotently configure the Stripe webhook secret on `canister_backend`.
 *
 * After the migration to canister-native Stripe Payment Links, the webhook
 * handler lives on the backend canister itself (`http_request_update` at
 * `/payments/stripe/webhook`). It rejects requests with HTTP 503 when
 * `stripeWebhookSecret` is null. This script is the only sanctioned way to
 * seed that value: it verifies the calling identity is admin on the target
 * canister, and if not, prints clear remediation steps.
 *
 * Usage:
 *   node scripts/bootstrap-payments.mjs                 # defaults to --network local
 *   node scripts/bootstrap-payments.mjs --network ic --identity bootstrap-admin
 *   node scripts/bootstrap-payments.mjs --secret whsec_live_xxx --network ic --identity bootstrap-admin
 *
 * Default secret source: STRIPE_WEBHOOK_SECRET in <repo>/.env. Override via
 * `--secret <value>` (do not commit live-mode secrets to .env).
 *
 * Idempotent: a second run with the same value is a no-op (verified via the
 * `verifyPaymentWebhookSecret` query method).
 */
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");
const ADMIN_BOOTSTRAP_TOKEN = "__caffeine_admin_token_not_configured__";

function parseArgs(argv) {
  const args = { network: "local", identity: undefined, secret: undefined };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === "--network" && next) {
      args.network = next;
      i++;
    } else if (flag === "--identity" && next) {
      args.identity = next;
      i++;
    } else if (flag === "--secret" && next) {
      args.secret = next;
      i++;
    } else if (flag === "--help" || flag === "-h") {
      console.log(
        [
          "Usage: bootstrap-payments [--network local|ic] [--identity <name>] [--secret <whsec_...>]",
          "",
          "Defaults:",
          "  --network local",
          "  --identity      relay-admin (local) or current dfx identity (ic)",
          "  --secret        STRIPE_WEBHOOK_SECRET from <repo>/.env",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${flag}`);
      process.exit(2);
    }
  }
  if (args.network !== "local" && args.network !== "ic") {
    console.error(`--network must be 'local' or 'ic' (got '${args.network}')`);
    process.exit(2);
  }
  return args;
}

function readDotEnvVar(name) {
  let contents;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    return undefined;
  }
  const line = contents
    .split("\n")
    .find((candidate) => candidate.startsWith(`${name}=`));
  if (!line) return undefined;
  return line
    .slice(name.length + 1)
    .trim()
    .replace(/^['"]/, "")
    .replace(/['"]$/, "");
}

function dfx(args, { capture = false, identity, network, allowFail = false, env = {} } = {}) {
  const fullArgs = [];
  if (identity) fullArgs.push("--identity", identity);
  fullArgs.push(...args);
  if (network && !args.includes("--network")) fullArgs.push("--network", network);
  try {
    if (capture) {
      return execFileSync("dfx", fullArgs, {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, ...env },
      }).trim();
    }
    execFileSync("dfx", fullArgs, {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    return undefined;
  } catch (error) {
    if (allowFail) return undefined;
    throw error;
  }
}

function ensureLocalIdentity(name) {
  const list = execSync("dfx identity list", { cwd: repoRoot, encoding: "utf8" });
  const known = new Set(
    list.split(/\s+/).map((part) => part.replace("*", "").trim()).filter(Boolean),
  );
  if (known.has(name)) return;
  console.log(`[bootstrap-payments] Creating dfx identity '${name}' (storage-mode plaintext for local dev)…`);
  execSync(`dfx identity new ${name} --storage-mode plaintext`, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function pingLocal() {
  try {
    const out = execSync("dfx ping", { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
    return out.includes("replica_health_status") || out.includes("ic_api_version");
  } catch {
    return false;
  }
}

const args = parseArgs(process.argv);

const adminIdentity =
  args.identity ?? (args.network === "local" ? "relay-admin" : undefined);
if (args.network === "ic" && !adminIdentity) {
  console.error(
    "[bootstrap-payments] --network ic requires --identity <name>. Pass the dfx identity that holds admin on canister_backend.",
  );
  process.exit(2);
}

const STRIPE_WEBHOOK_SECRET = args.secret ?? readDotEnvVar("STRIPE_WEBHOOK_SECRET");
if (!STRIPE_WEBHOOK_SECRET) {
  console.error(
    "[bootstrap-payments] No webhook secret available. Pass --secret <whsec_...> or set STRIPE_WEBHOOK_SECRET in .env.",
  );
  process.exit(1);
}
if (!STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) {
  console.warn(
    `[bootstrap-payments] Warning: secret does not start with 'whsec_' (got '${STRIPE_WEBHOOK_SECRET.slice(0, 8)}…'). Stripe signing secrets always start with 'whsec_'.`,
  );
}

// Mainnet plaintext identities (the typical bootstrap-admin) require this env
// to allow controller-style calls without dfx prompting. Setting it here lets
// us do all the canister calls non-interactively.
const dfxEnv = args.network === "ic" ? { DFX_WARNING: "-mainnet_plaintext_identity" } : {};

if (args.network === "local") {
  if (!pingLocal()) {
    console.error(
      "[bootstrap-payments] dfx ping failed; is the local replica running? Try `dfx start --background --clean`.",
    );
    process.exit(1);
  }
  ensureLocalIdentity(adminIdentity);
}

console.log(
  `[bootstrap-payments] Target: --network ${args.network}, --identity ${adminIdentity ?? "(default)"}.`,
);

const matchesAlready =
  dfx(
    [
      "canister",
      "call",
      "canister_backend",
      "verifyPaymentWebhookSecret",
      `("stripe", "${STRIPE_WEBHOOK_SECRET}")`,
    ],
    { capture: true, identity: adminIdentity, network: args.network, allowFail: true, env: dfxEnv },
  ) === "(true)";

if (matchesAlready) {
  console.log(
    "[bootstrap-payments] OK: stripe webhook secret already matches the target value. No action needed.",
  );
  process.exit(0);
}

// Try to claim admin (no-op when admin is already assigned to this principal,
// trap when assigned to someone else). On local the access-control state may
// have been wiped by a recent deploy; on mainnet it should already be set up
// from a one-time `_initializeAccessControlWithSecret` call.
dfx(
  [
    "canister",
    "call",
    "canister_backend",
    "_initializeAccessControlWithSecret",
    `("${ADMIN_BOOTSTRAP_TOKEN}")`,
  ],
  { identity: adminIdentity, network: args.network, allowFail: true, env: dfxEnv },
);

const isAdmin =
  dfx(["canister", "call", "canister_backend", "isCallerAdmin"], {
    capture: true,
    identity: adminIdentity,
    network: args.network,
    allowFail: true,
    env: dfxEnv,
  }) === "(true)";

if (!isAdmin) {
  console.error(
    `[bootstrap-payments] FATAL: identity '${adminIdentity}' is not admin on canister_backend (--network ${args.network}).`,
  );
  console.error("");
  console.error("Remediation:");
  if (args.network === "local") {
    console.error(
      "  • Admin was already claimed by a different principal (likely an Internet Identity used in the browser).",
    );
    console.error(
      "  • Redeploy with `dfx deploy --identity kempo canister_backend` to wipe transient access-control state, then rerun this script.",
    );
  } else {
    console.error(
      "  • Have the existing admin call assignCallerUserRole to grant admin to the principal of",
    );
    console.error(`    identity '${adminIdentity}', or`);
    console.error(
      "  • If admin has never been claimed, run `_initializeAccessControlWithSecret(\"__caffeine_admin_token_not_configured__\")`",
    );
    console.error(
      `    as identity '${adminIdentity}' against --network ic, then rerun this script.`,
    );
  }
  process.exit(1);
}

dfx(
  [
    "canister",
    "call",
    "canister_backend",
    "configurePaymentWebhookSecrets",
    `(opt "${STRIPE_WEBHOOK_SECRET}", null)`,
  ],
  { identity: adminIdentity, network: args.network, env: dfxEnv },
);

const verified =
  dfx(
    [
      "canister",
      "call",
      "canister_backend",
      "verifyPaymentWebhookSecret",
      `("stripe", "${STRIPE_WEBHOOK_SECRET}")`,
    ],
    { capture: true, identity: adminIdentity, network: args.network, env: dfxEnv },
  ) === "(true)";

if (!verified) {
  console.error(
    "[bootstrap-payments] FATAL: configurePaymentWebhookSecrets succeeded but verifyPaymentWebhookSecret returned false. Backend out of sync.",
  );
  process.exit(1);
}

console.log(
  `[bootstrap-payments] OK: stripe webhook secret configured on canister_backend (--network ${args.network}) and verified.`,
);

// On local dev only: enable the explicit admin-bypass runtime flag so the
// frontend's anonymous calls work without an Internet Identity. This call
// requires admin and is a no-op on builds that don't expose the method.
if (args.network === "local") {
  dfx(
    ["canister", "call", "canister_backend", "setLocalDevAdminBypassEnabled", "(true)"],
    { identity: adminIdentity, network: args.network, allowFail: true, env: dfxEnv },
  );
}
