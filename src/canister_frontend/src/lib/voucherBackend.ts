import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import type { Identity } from "@icp-sdk/core/identity";
import { IDL } from "@icp-sdk/core/candid";
import { loadConfig } from "../config";
import { parseCanisterRejectMessage, voucherRedeemUserMessage } from "../utils/canisterErrors";

export type VoucherTier = "signature" | "legacy";

export interface VoucherCampaign {
  id: string;
  tier: VoucherTier;
  active: boolean;
  expiresAt?: bigint;
  issuedCount: bigint;
  redeemedCount: bigint;
  createdAt: bigint;
  updatedAt: bigint;
}

const idlFactory = ({ IDL: CandidIDL }: { IDL: typeof IDL }) => {
  const PlanTier = CandidIDL.Variant({
    free: CandidIDL.Null,
    signature: CandidIDL.Null,
    legacy: CandidIDL.Null,
  });
  const VoucherCampaign = CandidIDL.Record({
    id: CandidIDL.Text,
    tier: PlanTier,
    active: CandidIDL.Bool,
    expiresAt: CandidIDL.Opt(CandidIDL.Int),
    issuedCount: CandidIDL.Nat,
    redeemedCount: CandidIDL.Nat,
    createdAt: CandidIDL.Int,
    updatedAt: CandidIDL.Int,
  });
  const PaymentStatus = CandidIDL.Variant({
    pending: CandidIDL.Null,
    confirmed: CandidIDL.Null,
    failed: CandidIDL.Null,
    expired: CandidIDL.Null,
    refunded: CandidIDL.Null,
  });
  const PaymentIntentStatus = CandidIDL.Record({
    id: CandidIDL.Text,
    tier: PlanTier,
    paymentMethod: CandidIDL.Variant({
      card: CandidIDL.Null,
      crypto: CandidIDL.Null,
      voucher: CandidIDL.Null,
    }),
    provider: CandidIDL.Variant({
      stripe: CandidIDL.Null,
      coinbase: CandidIDL.Null,
      voucher: CandidIDL.Null,
    }),
    amountUsdCents: CandidIDL.Nat,
    currency: CandidIDL.Text,
    status: PaymentStatus,
    expiresAt: CandidIDL.Int,
    confirmedAt: CandidIDL.Opt(CandidIDL.Int),
    usedByCapsuleId: CandidIDL.Opt(CandidIDL.Nat),
    checkoutUrl: CandidIDL.Text,
    ownerEmail: CandidIDL.Opt(CandidIDL.Text),
  });
  return CandidIDL.Service({
    createVoucherCampaign: CandidIDL.Func(
      [CandidIDL.Text, PlanTier, CandidIDL.Opt(CandidIDL.Int), CandidIDL.Bool],
      [VoucherCampaign],
      [],
    ),
    issueVoucherCodes: CandidIDL.Func([CandidIDL.Text, CandidIDL.Vec(CandidIDL.Text)], [CandidIDL.Nat], []),
    listVoucherCampaigns: CandidIDL.Func([], [CandidIDL.Vec(VoucherCampaign)], ["query"]),
    redeemVoucherCode: CandidIDL.Func([CandidIDL.Text, PlanTier], [PaymentIntentStatus], []),
    setVoucherCampaignActive: CandidIDL.Func([CandidIDL.Text, CandidIDL.Bool], [VoucherCampaign], []),
    getLocalDevAdminBypassEnabled: CandidIDL.Func([], [CandidIDL.Bool], ["query"]),
  });
};

function toVariant<T extends string>(value: T): { [K in T]: null } {
  return { [value]: null } as { [K in T]: null };
}

function fromVariant<T extends string>(value: unknown): T {
  if (!value || typeof value !== "object") throw new Error("Invalid variant");
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== 1) throw new Error("Invalid variant payload");
  return keys[0] as T;
}

function fromOptional<T>(value: [] | [T] | undefined): T | undefined {
  if (!value || value.length === 0) return undefined;
  return value[0];
}

async function createVoucherActor(identity?: Identity) {
  const config = await loadConfig();
  const agent = new HttpAgent({
    host: config.backend_host,
    identity,
  });
  const isLocalHost =
    config.backend_host?.includes("localhost") ||
    config.backend_host?.includes("127.0.0.1");
  if (isLocalHost) {
    await agent.fetchRootKey().catch(() => undefined);
  }
  return Actor.createActor(idlFactory, {
    canisterId: config.backend_canister_id,
    agent,
  }) as any;
}

export async function listVoucherCampaigns(identity?: Identity): Promise<VoucherCampaign[]> {
  const actor = await createVoucherActor(identity);
  const campaigns = await actor.listVoucherCampaigns();
  return campaigns.map((c: any) => ({
    id: c.id,
    tier: fromVariant<VoucherTier>(c.tier),
    active: c.active,
    expiresAt: fromOptional<bigint>(c.expiresAt),
    issuedCount: c.issuedCount,
    redeemedCount: c.redeemedCount,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

export async function createVoucherCampaign(params: {
  identity?: Identity;
  campaignId: string;
  tier: VoucherTier;
  expiresAt?: bigint;
  active: boolean;
}): Promise<VoucherCampaign> {
  const actor = await createVoucherActor(params.identity);
  const campaign = await actor.createVoucherCampaign(
    params.campaignId,
    toVariant(params.tier),
    params.expiresAt ? [params.expiresAt] : [],
    params.active,
  );
  return {
    id: campaign.id,
    tier: fromVariant<VoucherTier>(campaign.tier),
    active: campaign.active,
    expiresAt: fromOptional<bigint>(campaign.expiresAt),
    issuedCount: campaign.issuedCount,
    redeemedCount: campaign.redeemedCount,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

export async function issueVoucherCodes(params: {
  identity?: Identity;
  campaignId: string;
  codes: string[];
}): Promise<bigint> {
  const actor = await createVoucherActor(params.identity);
  return actor.issueVoucherCodes(params.campaignId, params.codes);
}

export async function setVoucherCampaignActive(params: {
  identity?: Identity;
  campaignId: string;
  active: boolean;
}): Promise<void> {
  const actor = await createVoucherActor(params.identity);
  await actor.setVoucherCampaignActive(params.campaignId, params.active);
}

export async function redeemVoucherCode(params: {
  identity?: Identity;
  code: string;
  tier: VoucherTier;
}): Promise<{ id: string; status: string; ownerEmail?: string }> {
  try {
    const actor = await createVoucherActor(params.identity);
    const intent = await actor.redeemVoucherCode(params.code, toVariant(params.tier));
    return {
      id: intent.id,
      status: fromVariant<string>(intent.status),
      ownerEmail: fromOptional<string>(intent.ownerEmail),
    };
  } catch (e: unknown) {
    throw new Error(voucherRedeemUserMessage(parseCanisterRejectMessage(e)));
  }
}

export async function getLocalDevAdminBypassEnabled(identity?: Identity): Promise<boolean> {
  const actor = await createVoucherActor(identity);
  return actor.getLocalDevAdminBypassEnabled();
}
