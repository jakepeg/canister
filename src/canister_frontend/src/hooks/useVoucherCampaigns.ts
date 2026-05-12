import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useInternetIdentity } from "./useInternetIdentity";
import {
  createVoucherCampaign,
  getLocalDevAdminBypassEnabled,
  issueVoucherCodes,
  listVoucherCampaigns,
  redeemVoucherCode,
  setVoucherCampaignActive,
  type VoucherTier,
} from "../lib/voucherBackend";

export function useVoucherCampaigns() {
  const { identity } = useInternetIdentity();
  return useQuery({
    queryKey: ["voucherCampaigns", identity?.getPrincipal().toString()],
    queryFn: () => listVoucherCampaigns(identity),
    enabled: !!identity,
  });
}

export function useCreateVoucherCampaign() {
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      campaignId: string;
      tier: VoucherTier;
      expiresAt?: bigint;
      active: boolean;
    }) => createVoucherCampaign({ ...params, identity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucherCampaigns"] });
    },
  });
}

export function useIssueVoucherCodes() {
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { campaignId: string; codes: string[] }) =>
      issueVoucherCodes({ ...params, identity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucherCampaigns"] });
    },
  });
}

export function useSetVoucherCampaignActive() {
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { campaignId: string; active: boolean }) =>
      setVoucherCampaignActive({ ...params, identity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucherCampaigns"] });
    },
  });
}

export function useRedeemVoucherCode() {
  const { identity } = useInternetIdentity();
  return useMutation({
    mutationFn: (params: { code: string; tier: VoucherTier }) =>
      redeemVoucherCode({ ...params, identity }),
  });
}

export function useLocalDevAdminBypassStatus(enabled: boolean) {
  const { identity } = useInternetIdentity();
  return useQuery({
    queryKey: ["localDevAdminBypassEnabled", identity?.getPrincipal().toString()],
    queryFn: () => getLocalDevAdminBypassEnabled(identity),
    enabled,
  });
}
