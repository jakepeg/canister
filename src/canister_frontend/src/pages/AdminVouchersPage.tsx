import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UserRole } from "../backend";
import { useActor } from "../hooks/useActor";
import {
  useCreateVoucherCampaign,
  useIssueVoucherCodes,
  useLocalDevAdminBypassStatus,
  useSetVoucherCampaignActive,
  useVoucherCampaigns,
} from "../hooks/useVoucherCampaigns";

function formatDate(value?: bigint) {
  if (!value) return "Never";
  return new Date(Number(value / 1_000_000n)).toLocaleDateString("en-US");
}

function normalizeCampaign(campaignId: string) {
  return campaignId.trim().toUpperCase();
}

function generateVoucherCodes(campaignId: string, count: number): string[] {
  const normalizedCampaign = normalizeCampaign(campaignId);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const makeSuffix = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  };
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(`${normalizedCampaign}-${makeSuffix()}`);
  }
  return Array.from(codes);
}

export default function AdminVouchersPage() {
  const { actor } = useActor();
  const [campaignId, setCampaignId] = useState("");
  const [tier, setTier] = useState<"signature" | "legacy">("signature");
  const [quantity, setQuantity] = useState("100");
  const [neverExpire, setNeverExpire] = useState(false);
  const [topupCountByCampaign, setTopupCountByCampaign] = useState<Record<string, string>>({});

  const roleQuery = useQuery({
    queryKey: ["callerRole"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getCallerUserRole();
    },
    enabled: !!actor,
  });
  const isAdmin = roleQuery.data === UserRole.admin;
  const isLocal = import.meta.env.DFX_NETWORK === "local";
  const canUseAdminTools = isAdmin || isLocal;

  const campaignsQuery = useVoucherCampaigns();
  const localBypassStatus = useLocalDevAdminBypassStatus(isAdmin);
  const createCampaign = useCreateVoucherCampaign();
  const issueCodes = useIssueVoucherCodes();
  const setCampaignActive = useSetVoucherCampaignActive();

  const expiresAt = useMemo(() => {
    if (neverExpire) return undefined;
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return BigInt(now + thirtyDaysMs) * 1_000_000n;
  }, [neverExpire]);

  async function handleCreateCampaign() {
    try {
      const normalizedCampaign = normalizeCampaign(campaignId);
      const codeCount = Number(quantity);
      if (!normalizedCampaign || codeCount <= 0) {
        throw new Error("Campaign id and quantity are required.");
      }
      await createCampaign.mutateAsync({
        campaignId: normalizedCampaign,
        tier,
        expiresAt,
        active: true,
      });
      const codes = generateVoucherCodes(normalizedCampaign, codeCount);
      await issueCodes.mutateAsync({ campaignId: normalizedCampaign, codes });
      setCampaignId("");
      setQuantity(tier === "legacy" ? "10" : "100");
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Campaign created. Voucher codes copied to clipboard.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create campaign");
    }
  }

  async function handleTopUp(campaignIdValue: string) {
    try {
      const count = Number(topupCountByCampaign[campaignIdValue] ?? "0");
      if (count <= 0) throw new Error("Enter a valid top-up quantity.");
      const codes = generateVoucherCodes(campaignIdValue, count);
      await issueCodes.mutateAsync({ campaignId: campaignIdValue, codes });
      setTopupCountByCampaign((prev) => ({ ...prev, [campaignIdValue]: "" }));
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Top-up successful. New codes copied to clipboard.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to top up campaign");
    }
  }

  if (roleQuery.isLoading) {
    return <main className="min-h-screen pt-24 px-4">Checking admin access...</main>;
  }
  if (!canUseAdminTools) {
    return (
      <main className="min-h-screen pt-24 px-4">
        Admin access required.
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-4xl space-y-8">
        <section className="rounded-sm border border-border/60 bg-card/80 p-6 space-y-4">
          <h1 className="text-2xl font-bold">Voucher Campaigns</h1>
          {isLocal && !isAdmin && (
            <p className="text-xs text-muted-foreground">
              Local development mode: admin-only tools require the canister's local bypass runtime flag.
            </p>
          )}
          {isAdmin && isLocal && (
            <p className="text-xs text-muted-foreground">
              Local bypass runtime flag:{" "}
              {localBypassStatus.isLoading
                ? "checking..."
                : localBypassStatus.data
                  ? "enabled"
                  : "disabled"}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Codes use format <code>{`<campaign>-<random>`}</code> and default to 30-day expiry.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-id">Campaign id</Label>
              <Input
                id="campaign-id"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value.toUpperCase())}
                placeholder="SPRING26"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-qty">Initial quantity</Label>
              <Input
                id="campaign-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={tier === "signature" ? "sales" : "outline"}
              onClick={() => setTier("signature")}
            >
              Signature
            </Button>
            <Button
              type="button"
              variant={tier === "legacy" ? "sales" : "outline"}
              onClick={() => setTier("legacy")}
            >
              Legacy
            </Button>
            <Button type="button" variant="outline" onClick={() => setNeverExpire((v) => !v)}>
              {neverExpire ? "Never expires" : "Expires in 30 days"}
            </Button>
            <Button onClick={handleCreateCampaign} disabled={createCampaign.isPending || issueCodes.isPending}>
              Create campaign
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          {(campaignsQuery.data ?? []).map((campaign) => {
            const remaining = campaign.issuedCount - campaign.redeemedCount;
            return (
              <div key={campaign.id} className="rounded-sm border border-border/60 bg-card/80 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{campaign.id}</h2>
                  <Badge>{campaign.tier}</Badge>
                  <Badge>{campaign.active ? "Active" : "Paused"}</Badge>
                  <span className="text-xs text-muted-foreground">Expires: {formatDate(campaign.expiresAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Issued: {campaign.issuedCount.toString()} · Redeemed: {campaign.redeemedCount.toString()} · Remaining: {remaining.toString()}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Top-up quantity"
                    value={topupCountByCampaign[campaign.id] ?? ""}
                    onChange={(e) =>
                      setTopupCountByCampaign((prev) => ({ ...prev, [campaign.id]: e.target.value }))
                    }
                    className="w-44"
                  />
                  <Button onClick={() => handleTopUp(campaign.id)} disabled={issueCodes.isPending}>
                    Add vouchers
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCampaignActive.mutate({
                        campaignId: campaign.id,
                        active: !campaign.active,
                      })
                    }
                  >
                    {campaign.active ? "Pause" : "Resume"}
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
