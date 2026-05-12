import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapsuleId, CapsuleMetadata } from "../backend";
import type { ExternalBlob } from "../backend";
import { useActor } from "./useActor";

export type PlanTier = "free" | "signature" | "legacy";
export type PaymentMethod = "card" | "crypto" | "voucher";
export type PaymentStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "expired"
  | "refunded";

export interface PlanQuote {
  tier: PlanTier;
  name: string;
  amountUsdCents: bigint;
  currency: string;
  includedCanisters: bigint;
}

export const FALLBACK_PRICING_PLANS: PlanQuote[] = [
  {
    tier: "free",
    name: "Essential",
    amountUsdCents: 0n,
    currency: "USD",
    includedCanisters: 1n,
  },
  {
    tier: "signature",
    name: "Signature",
    amountUsdCents: 1200n,
    currency: "USD",
    includedCanisters: 1n,
  },
  {
    tier: "legacy",
    name: "Legacy",
    amountUsdCents: 3900n,
    currency: "USD",
    includedCanisters: 1n,
  },
];

export interface PaymentIntentStatus {
  id: string;
  tier: PlanTier;
  paymentMethod: PaymentMethod;
  provider: "stripe" | "coinbase" | "voucher";
  amountUsdCents: bigint;
  currency: string;
  status: PaymentStatus;
  expiresAt: bigint;
  confirmedAt?: bigint;
  usedByCapsuleId?: bigint;
  checkoutUrl: string;
  ownerEmail?: string;
}

export type ReminderTarget = "owner" | "other";

export interface PaymentNotificationPreferences {
  ownerEmail: string;
  recipientEmail?: string;
  reminderTarget: ReminderTarget;
  reminderOptIn: boolean;
  marketingOptIn: boolean;
  notifyRecipientOnCreation: boolean;
  hasRecipientPermission: boolean;
  reminderConsentAt?: bigint;
  marketingConsentAt?: bigint;
  creationNoticeSentAt?: bigint;
  updatedAt: bigint;
}

const toVariant = <T extends string>(value: T): { [K in T]: null } =>
  ({ [value]: null }) as { [K in T]: null };

function fromVariant<T extends string>(value: unknown): T {
  if (!value || typeof value !== "object") {
    throw new Error("Unexpected variant value");
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== 1) {
    throw new Error("Invalid variant payload");
  }
  return keys[0] as T;
}

function fromOptional<T>(value: [] | [T] | undefined): T | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }
  return value[0];
}

export function useGetTotalCapsuleCount() {
  const { actor, isFetching } = useActor();
  return useQuery<bigint>({
    queryKey: ["totalCapsuleCount"],
    queryFn: async () => {
      if (!actor) return 0n;
      return actor.getTotalCapsuleCount();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetMyCapsules() {
  const { actor, isFetching } = useActor();
  return useQuery<CapsuleMetadata[]>({
    queryKey: ["myCapsules"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getMyCapsules();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetCapsuleMetadata(id: CapsuleId | null) {
  const { actor, isFetching } = useActor();
  return useQuery<CapsuleMetadata>({
    queryKey: ["capsuleMetadata", id?.toString()],
    queryFn: async () => {
      if (!actor || id === null) throw new Error("No actor or id");
      return actor.getCapsuleMetadata(id);
    },
    enabled: !!actor && !isFetching && id !== null,
    retry: 2,
  });
}

export function useGetCapsuleContent(id: CapsuleId | null, enabled: boolean) {
  const { actor, isFetching } = useActor();
  return useQuery<{ fileRefs: ExternalBlob[]; encryptedMessage: string }>({
    queryKey: ["capsuleContent", id?.toString()],
    queryFn: async () => {
      if (!actor || id === null) throw new Error("No actor or id");
      return actor.getCapsuleContent(id);
    },
    enabled: !!actor && !isFetching && id !== null && enabled,
    retry: 1,
  });
}

export function useCreateCapsule() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      publicId: string;
      title: string;
      encryptedMessage: string;
      fileRefs: ExternalBlob[];
      unlockDate: bigint;
      messageCharCount: number;
      paymentIntentId?: string;
    }) => {
      if (!actor) throw new Error("Not connected");
      return actor.createCapsule(
        params.publicId,
        params.title,
        params.encryptedMessage,
        params.fileRefs,
        params.unlockDate,
        BigInt(params.messageCharCount),
        params.paymentIntentId ? [params.paymentIntentId] : [],
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myCapsules"] });
      queryClient.invalidateQueries({ queryKey: ["totalCapsuleCount"] });
    },
  });
}

export function usePricingPlans() {
  const { actor, isFetching } = useActor();
  return useQuery<PlanQuote[]>({
    queryKey: ["pricingPlans"],
    queryFn: async () => {
      if (!actor) return [];
      try {
        const plans = await (actor as any).getPricingPlans();
        const mapped = plans.map((plan: any) => ({
          tier: fromVariant<PlanTier>(plan.tier),
          name: plan.name,
          amountUsdCents: plan.amountUsdCents,
          currency: plan.currency,
          includedCanisters: plan.includedCanisters,
        }));
        if (mapped.length === 0) {
          if (import.meta.env.PROD) {
            console.warn("[pricing] Backend returned no plans in production.");
          }
          return [];
        }
        return mapped;
      } catch (error) {
        if (import.meta.env.PROD) {
          console.warn("[pricing] Failed to fetch backend pricing in production.", error);
        }
        return [];
      }
    },
    enabled: !!actor && !isFetching,
  });
}

export function useCreatePaymentIntent() {
  const { actor } = useActor();
  return useMutation({
    mutationFn: async (params: { tier: PlanTier; paymentMethod: PaymentMethod }) => {
      if (!actor) throw new Error("Not connected");
      const intent = await (actor as any).createPaymentIntent(
        toVariant(params.tier),
        toVariant(params.paymentMethod),
      );
      return {
        id: intent.id,
        tier: fromVariant<PlanTier>(intent.tier),
        paymentMethod: fromVariant<PaymentMethod>(intent.paymentMethod),
        provider: fromVariant<"stripe" | "coinbase" | "voucher">(intent.provider),
        amountUsdCents: intent.amountUsdCents,
        currency: intent.currency,
        status: fromVariant<PaymentStatus>(intent.status),
        expiresAt: intent.expiresAt,
        confirmedAt: fromOptional(intent.confirmedAt),
        usedByCapsuleId: fromOptional(intent.usedByCapsuleId),
        checkoutUrl: intent.checkoutUrl,
        ownerEmail: fromOptional(intent.ownerEmail),
      } satisfies PaymentIntentStatus;
    },
  });
}

export function usePaymentIntentStatus(intentId: string | null) {
  const { actor, isFetching } = useActor();
  return useQuery<PaymentIntentStatus>({
    queryKey: ["paymentIntentStatus", intentId],
    queryFn: async () => {
      if (!actor || !intentId) throw new Error("No actor or intent id");
      const intent = await (actor as any).getPaymentIntentStatus(intentId);
      return {
        id: intent.id,
        tier: fromVariant<PlanTier>(intent.tier),
        paymentMethod: fromVariant<PaymentMethod>(intent.paymentMethod),
        provider: fromVariant<"stripe" | "coinbase" | "voucher">(intent.provider),
        amountUsdCents: intent.amountUsdCents,
        currency: intent.currency,
        status: fromVariant<PaymentStatus>(intent.status),
        expiresAt: intent.expiresAt,
        confirmedAt: fromOptional(intent.confirmedAt),
        usedByCapsuleId: fromOptional(intent.usedByCapsuleId),
        checkoutUrl: intent.checkoutUrl,
        ownerEmail: fromOptional(intent.ownerEmail),
      };
    },
    enabled: !!actor && !isFetching && !!intentId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || status === "pending" ? 3000 : false;
    },
    refetchOnWindowFocus: true,
  });
}

export function useConfirmPaymentIntent() {
  const { actor } = useActor();
  return useMutation({
    mutationFn: async (params: {
      intentId: string;
      providerPaymentId: string;
      targetStatus: PaymentStatus;
      webhookSecret?: string;
    }) => {
      if (!actor) throw new Error("Not connected");
      const intent = await (actor as any).confirmPaymentIntent(
        params.intentId,
        params.providerPaymentId,
        toVariant(params.targetStatus),
        params.webhookSecret ?? "dev-webhook-secret",
      );
      return {
        id: intent.id,
        tier: fromVariant<PlanTier>(intent.tier),
        paymentMethod: fromVariant<PaymentMethod>(intent.paymentMethod),
        provider: fromVariant<"stripe" | "coinbase" | "voucher">(intent.provider),
        amountUsdCents: intent.amountUsdCents,
        currency: intent.currency,
        status: fromVariant<PaymentStatus>(intent.status),
        expiresAt: intent.expiresAt,
        confirmedAt: fromOptional(intent.confirmedAt),
        usedByCapsuleId: fromOptional(intent.usedByCapsuleId),
        checkoutUrl: intent.checkoutUrl,
        ownerEmail: fromOptional(intent.ownerEmail),
      } satisfies PaymentIntentStatus;
    },
  });
}

export function usePaymentNotificationPreferences(intentId: string | null) {
  const { actor, isFetching } = useActor();
  return useQuery<PaymentNotificationPreferences | null>({
    queryKey: ["paymentNotificationPreferences", intentId],
    queryFn: async () => {
      if (!actor || !intentId) return null;
      const prefs = await (actor as any).getPaymentNotificationPreferences(intentId);
      if (!prefs || prefs.length === 0) return null;
      const value = prefs[0];
      return {
        ownerEmail: value.ownerEmail,
        recipientEmail: fromOptional(value.recipientEmail),
        reminderTarget: fromVariant<ReminderTarget>(value.reminderTarget),
        reminderOptIn: value.reminderOptIn,
        marketingOptIn: value.marketingOptIn,
        notifyRecipientOnCreation: value.notifyRecipientOnCreation,
        hasRecipientPermission: value.hasRecipientPermission,
        reminderConsentAt: fromOptional(value.reminderConsentAt),
        marketingConsentAt: fromOptional(value.marketingConsentAt),
        creationNoticeSentAt: fromOptional(value.creationNoticeSentAt),
        updatedAt: value.updatedAt,
      } satisfies PaymentNotificationPreferences;
    },
    enabled: !!actor && !isFetching && !!intentId,
  });
}

export function useSavePaymentNotificationPreferences() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      intentId: string;
      ownerEmail: string;
      reminderTarget: ReminderTarget;
      recipientEmail?: string;
      reminderOptIn: boolean;
      marketingOptIn: boolean;
      notifyRecipientOnCreation: boolean;
      hasRecipientPermission: boolean;
    }) => {
      if (!actor) throw new Error("Not connected");
      await (actor as any).savePaymentNotificationPreferences(
        params.intentId,
        params.ownerEmail,
        toVariant(params.reminderTarget),
        params.recipientEmail ? [params.recipientEmail] : [],
        params.reminderOptIn,
        params.marketingOptIn,
        params.notifyRecipientOnCreation,
        params.hasRecipientPermission,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["paymentNotificationPreferences", variables.intentId],
      });
      queryClient.invalidateQueries({
        queryKey: ["paymentIntentStatus", variables.intentId],
      });
    },
  });
}
