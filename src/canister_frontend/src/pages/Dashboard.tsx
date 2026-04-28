import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import { Archive, Lock, LogIn, Plus, Unlock } from "lucide-react";
import { motion } from "motion/react";
import type { CapsuleMetadata } from "../backend";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useGetMyCapsules } from "../hooks/useQueries";

function formatDate(timeNs: bigint): string {
  return new Date(Number(timeNs / 1_000_000n)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CapsuleCard({
  capsule,
  index,
  onClick,
}: {
  capsule: CapsuleMetadata;
  index: number;
  onClick: () => void;
}) {
  const unlocked = capsule.isUnlocked;
  const unlockDate = new Date(Number(capsule.unlockDate / 1_000_000n));
  const now = new Date();
  const isOverdue = unlockDate <= now && !unlocked;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      onClick={onClick}
      className="w-full text-left p-6 rounded-sm border bg-card/80 hover:bg-card transition-all group cursor-pointer
        border-border/60 hover:border-primary/40 hover:glow-cyan"
      data-ocid={`dashboard.item.${index + 1}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 ${
                unlocked
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-amber/10 text-amber border border-amber/30"
              }`}
            >
              {unlocked ? (
                <Unlock className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {capsule.title}
            </h3>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Created {formatDate(capsule.createdDate)}</span>
            <span
              className={
                isOverdue ? "text-amber" : unlocked ? "text-primary" : ""
              }
            >
              Unlocks {formatDate(capsule.unlockDate)}
            </span>
          </div>
        </div>

        <Badge
          className={`shrink-0 font-mono-display text-xs rounded-sm ${
            unlocked
              ? "bg-primary/15 text-primary border-primary/30 border"
              : isOverdue
                ? "bg-amber/20 text-amber border-amber/40 border animate-pulse"
                : "bg-amber/10 text-amber border-amber/20 border"
          }`}
        >
          {unlocked ? "UNLOCKED" : isOverdue ? "READY" : "LOCKED"}
        </Badge>
      </div>
    </motion.button>
  );
}

export default function Dashboard() {
  const { identity, login } = useInternetIdentity();
  const navigate = useNavigate();
  const { data: capsules, isLoading, isError } = useGetMyCapsules();

  if (!identity) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md p-10 rounded-sm border border-border/60 bg-card/80"
          data-ocid="dashboard.panel"
        >
          <Lock className="w-12 h-12 text-primary mx-auto mb-6 opacity-80" />
          <h2 className="font-display text-3xl font-bold text-foreground mb-3">
            Sign in to view your canisters
          </h2>
          <p className="text-muted-foreground mb-8">
            Connect your wallet to access your sealed canisters.
          </p>
          <Button
            onClick={login}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan rounded-sm"
            data-ocid="dashboard.primary_button"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Connect Wallet
          </Button>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h1 className="font-display text-4xl font-bold text-foreground mb-1">
              My Canisters
            </h1>
            <p className="text-muted-foreground text-sm">
              {capsules?.length ?? 0} canister
              {(capsules?.length ?? 0) !== 1 ? "s" : ""} sealed on-chain
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Button
              onClick={() => navigate({ to: "/create" })}
              className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 glow-cyan rounded-sm"
              data-ocid="dashboard.primary_button"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Canister
            </Button>
          </motion.div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4" data-ocid="dashboard.loading_state">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-sm bg-card/60" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div
            className="p-6 rounded-sm border border-destructive/30 bg-destructive/10 text-center"
            data-ocid="dashboard.error_state"
          >
            <p className="text-destructive text-sm">
              Failed to load canisters. Please try again.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && capsules?.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
            data-ocid="dashboard.empty_state"
          >
            <Archive className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-display text-2xl font-bold text-foreground mb-2">
              No canisters yet
            </h3>
            <p className="text-muted-foreground mb-8">
              Create your first digital time capsule and seal it on the
              blockchain.
            </p>
            <Button
              onClick={() => navigate({ to: "/create" })}
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan rounded-sm"
              data-ocid="dashboard.primary_button"
            >
              Create Your First Canister
            </Button>
          </motion.div>
        )}

        {/* Capsule list */}
        {!isLoading && !isError && capsules && capsules.length > 0 && (
          <div className="space-y-4" data-ocid="dashboard.list">
            {capsules.map((capsule: CapsuleMetadata, i) => (
              <CapsuleCard
                key={capsule.id}
                capsule={capsule}
                index={i}
                onClick={() =>
                  navigate({
                    to: "/claim/$id",
                    params: { id: capsule.id },
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
