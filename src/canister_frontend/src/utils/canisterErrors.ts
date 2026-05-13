/**
 * Parses Internet Computer / agent rejection payloads so Motoko trap strings
 * (e.g. "Invalid voucher code") surface instead of raw Candid blobs.
 */
export function parseCanisterRejectMessage(error: unknown): string {
  let raw: string;
  if (error instanceof Error) {
    raw = error.message;
  } else if (error && typeof error === "object" && "message" in error) {
    raw = String((error as { message: unknown }).message);
  } else {
    raw = String(error);
  }
  return extractEmbeddedTrapMessage(raw);
}

function extractEmbeddedTrapMessage(errorString: string): string {
  const s = String(errorString);
  const singleQuoted = s.match(/with message:\s*'([^']*)'/s);
  if (singleQuoted) {
    return singleQuoted[1];
  }
  const doubleQuoted = s.match(/with message:\s*"([^"]*)"/s);
  if (doubleQuoted) {
    return doubleQuoted[1];
  }
  return s;
}

const VOUCHER_REDEEM_GENERIC =
  "We couldn't redeem this voucher. Check the code, or try the other paid plan (Signature vs Legacy). If it still fails, contact support.";

/**
 * Maps parsed canister trap text to copy for voucher redemption failures.
 */
export function voucherRedeemUserMessage(parsed: string): string {
  const t = parsed.trim();
  if (t.length > 400) {
    return VOUCHER_REDEEM_GENERIC;
  }
  const lower = t.toLowerCase();

  if (lower.includes("invalid voucher code")) {
    return "That voucher code was not recognized. Check for typos. If you're sure it's correct, it may be for a different plan—try Signature or Legacy, or confirm where the code came from.";
  }
  if (lower.includes("voucher does not match selected plan")) {
    return "This voucher is for a different plan than the one you selected. Switch between Signature and Legacy above, or use a code issued for your current plan.";
  }
  if (lower.includes("voucher expired")) {
    return "This voucher has expired.";
  }
  if (lower.includes("voucher already redeemed")) {
    return "This voucher has already been redeemed.";
  }
  if (lower.includes("voucher already claimed by another user")) {
    return "This voucher is tied to another account. Sign in with the account that claimed it, or use a different code.";
  }
  if (lower.includes("voucher campaign is not active")) {
    return "This voucher campaign is not active. Contact support if you need help.";
  }
  if (lower.includes("campaign not found")) {
    return "This voucher could not be matched to an active campaign.";
  }
  if (lower.includes("unauthorized")) {
    return "Sign in to redeem a voucher.";
  }
  if (lower.includes("free plan does not require vouchers")) {
    return "Vouchers apply to paid plans only. Select Signature or Legacy.";
  }

  if (t.length > 0 && t.length < 400) {
    return t;
  }
  return VOUCHER_REDEEM_GENERIC;
}
