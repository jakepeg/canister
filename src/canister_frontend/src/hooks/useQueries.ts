import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapsuleId, CapsuleMetadata } from "../backend";
import type { ExternalBlob } from "../backend";
import { useActor } from "./useActor";

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
      title: string;
      encryptedMessage: string;
      fileRefs: ExternalBlob[];
      unlockDate: bigint;
    }) => {
      if (!actor) throw new Error("Not connected");
      return actor.createCapsule(
        params.title,
        params.encryptedMessage,
        params.fileRefs,
        params.unlockDate,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myCapsules"] });
      queryClient.invalidateQueries({ queryKey: ["totalCapsuleCount"] });
    },
  });
}
