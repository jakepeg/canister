#!/usr/bin/env node
/**
 * Local-only voucher campaign seeder. Creates SIGNATURE / LEGACY campaigns on
 * canister_backend (local replica) and issues a configurable batch of codes.
 *
 * Split out of the old bootstrap script so the canonical bootstrap stays
 * focused on the webhook secret and works against mainnet too.
 *
 * Usage:
 *   node scripts/seed-local-vouchers.mjs                # defaults
 *   VOUCHER_SIGNATURE_COUNT=50 VOUCHER_LEGACY_COUNT=5 \
 *     node scripts/seed-local-vouchers.mjs
 *
 * Idempotent: re-runs are safe — `createVoucherCampaign` is skipped when the
 * campaign already exists; `issueVoucherCodes` always issues a fresh batch.
 */
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ADMIN_IDENTITY = process.env.PAYMENTS_RELAY_ADMIN_IDENTITY ?? "relay-admin";
const VOUCHER_SIGNATURE_CAMPAIGN = process.env.VOUCHER_SIGNATURE_CAMPAIGN ?? "SIGNATURE";
const VOUCHER_LEGACY_CAMPAIGN = process.env.VOUCHER_LEGACY_CAMPAIGN ?? "LEGACY";
const VOUCHER_SIGNATURE_COUNT = Number(process.env.VOUCHER_SIGNATURE_COUNT ?? "100");
const VOUCHER_LEGACY_COUNT = Number(process.env.VOUCHER_LEGACY_COUNT ?? "10");

function dfx(args, { capture = false, identity, allowFail = false } = {}) {
  const fullArgs = identity ? ["--identity", identity, ...args] : args;
  try {
    if (capture) {
      return execFileSync("dfx", fullArgs, { cwd: repoRoot, encoding: "utf8" }).trim();
    }
    execFileSync("dfx", fullArgs, { cwd: repoRoot, stdio: "inherit" });
    return undefined;
  } catch (error) {
    if (allowFail) return undefined;
    throw error;
  }
}

function escapeCandidText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function randomVoucherCode(campaignId) {
  // Crockford-ish base32 minus ambiguous chars.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `${campaignId}-${suffix}`;
}

function generateVoucherCodes(campaignId, count) {
  const normalized = String(campaignId).trim().toUpperCase();
  const values = new Set();
  while (values.size < count) values.add(randomVoucherCode(normalized));
  return [...values];
}

function createCampaignIfMissing(campaignId, tier) {
  const listResult = dfx(
    ["canister", "call", "canister_backend", "listVoucherCampaigns", "()"],
    { capture: true, identity: ADMIN_IDENTITY, allowFail: true },
  );
  if (listResult === undefined) {
    console.warn(
      "[seed-local-vouchers] Voucher APIs unavailable (backend not upgraded yet). Skipping.",
    );
    return false;
  }
  if (listResult.includes(`id = "${campaignId}"`)) return true;
  dfx(
    [
      "canister",
      "call",
      "canister_backend",
      "createVoucherCampaign",
      `("${escapeCandidText(campaignId)}", variant { ${tier} }, null, true)`,
    ],
    { identity: ADMIN_IDENTITY },
  );
  return true;
}

function issueCampaignCodes(campaignId, count) {
  if (count <= 0) return;
  const codes = generateVoucherCodes(campaignId, count);
  const candidVec = codes.map((code) => `"${escapeCandidText(code)}"`).join("; ");
  dfx(
    [
      "canister",
      "call",
      "canister_backend",
      "issueVoucherCodes",
      `("${escapeCandidText(campaignId)}", vec { ${candidVec} })`,
    ],
    { identity: ADMIN_IDENTITY },
  );
  console.log(`[seed-local-vouchers] Issued ${count} voucher codes for ${campaignId}.`);
}

try {
  execSync("dfx ping", { cwd: repoRoot, stdio: "pipe" });
} catch {
  console.error(
    "[seed-local-vouchers] dfx ping failed; is the local replica running? `dfx start --background --clean`.",
  );
  process.exit(1);
}

const isAdmin =
  dfx(["canister", "call", "canister_backend", "isCallerAdmin"], {
    capture: true,
    identity: ADMIN_IDENTITY,
    allowFail: true,
  }) === "(true)";
if (!isAdmin) {
  console.error(
    `[seed-local-vouchers] Identity '${ADMIN_IDENTITY}' is not admin on canister_backend. Run scripts/bootstrap-payments.mjs first.`,
  );
  process.exit(1);
}

const sig = VOUCHER_SIGNATURE_CAMPAIGN.trim().toUpperCase();
const legacy = VOUCHER_LEGACY_CAMPAIGN.trim().toUpperCase();
if (createCampaignIfMissing(sig, "signature")) issueCampaignCodes(sig, VOUCHER_SIGNATURE_COUNT);
if (createCampaignIfMissing(legacy, "legacy")) issueCampaignCodes(legacy, VOUCHER_LEGACY_COUNT);
