import type { PlanTier } from "../hooks/useQueries";

const RAW_LINKS: Record<Exclude<PlanTier, "free">, string | undefined> = {
  signature: import.meta.env.VITE_STRIPE_LINK_SIGNATURE as string | undefined,
  legacy: import.meta.env.VITE_STRIPE_LINK_LEGACY as string | undefined,
};

export function getStripePaymentLinkBase(tier: PlanTier): string | null {
  if (tier === "free") return null;
  const raw = RAW_LINKS[tier];
  return raw && raw.length > 0 ? raw : null;
}

/**
 * Construct the URL the SPA should send users to in order to pay for `tier`.
 * `intentId` is forwarded as Stripe Checkout's `client_reference_id` so the
 * webhook handler on the backend canister can match the resulting
 * `checkout.session.completed` event back to the originating payment intent.
 *
 * Returns null if the link is not configured (e.g. dev .env.local missing the
 * `VITE_STRIPE_LINK_<TIER>` value), so the caller can render a clear error.
 */
export function buildStripePaymentLinkUrl(
  tier: PlanTier,
  intentId: string,
): string | null {
  const base = getStripePaymentLinkBase(tier);
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("client_reference_id", intentId);
  return url.toString();
}
