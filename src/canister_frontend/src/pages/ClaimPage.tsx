import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useParams } from "@tanstack/react-router";
import { AlertTriangle, Clock, Download, Lock, Unlock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type { ExternalBlob } from "../backend";
import { useActor } from "../hooks/useActor";
import {
  useGetCapsuleContent,
  useGetCapsuleMetadata,
} from "../hooks/useQueries";

function formatDate(timeNs: bigint): string {
  return new Date(Number(timeNs / 1_000_000n)).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getCountdown(unlockDateNs: bigint): CountdownTime {
  const unlockMs = Number(unlockDateNs / 1_000_000n);
  const diff = Math.max(0, unlockMs - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds };
}

async function decryptMessage(
  encryptedMessage: string,
  keyBase64: string,
): Promise<string> {
  const keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const combined = Uint8Array.from(atob(encryptedMessage), (c) =>
    c.charCodeAt(0),
  );
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-sm border border-amber/30 bg-amber/5 flex items-center justify-center glow-amber">
        <span className="font-mono-display text-3xl md:text-4xl font-bold text-amber">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="text-xs text-muted-foreground mt-2 uppercase tracking-wider font-medium">
        {label}
      </span>
    </div>
  );
}

function FileRefItem({
  fileId,
  index,
  onDownload,
}: {
  fileId: string;
  index: number;
  onDownload: (fileId: string) => Promise<void>;
}) {
  const ocid = `claim.item.${index + 1}` as const;
  const btnOcid = "claim.secondary_button" as const;
  return (
    <div
      className="flex items-center justify-between p-3 rounded-sm border border-border/40 bg-secondary/30"
      data-ocid={ocid}
    >
      <span className="text-sm text-foreground">File {index + 1}</span>
      <Button
        size="sm"
        variant="outline"
        className="border-primary/30 text-primary hover:bg-primary/10"
        onClick={() => {
          void onDownload(fileId);
        }}
        data-ocid={btnOcid}
      >
        <Download className="w-3 h-3 mr-1.5" />
        Download
      </Button>
    </div>
  );
}

export default function ClaimPage() {
  const { id } = useParams({ from: "/claim/$id" });
  const capsuleId = id;
  const { actor } = useActor();

  // Extract key from URL hash, with in-memory fallback from manual entry.
  const [decryptKey, setDecryptKey] = useState<string>(() =>
    window.location.hash.slice(1),
  );
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const [manualKeyInput, setManualKeyInput] = useState("");

  const {
    data: metadata,
    isLoading: metaLoading,
    isError: metaError,
  } = useGetCapsuleMetadata(capsuleId);

  const isUnlocked = metadata?.isUnlocked ?? false;
  const { data: content, isLoading: contentLoading } = useGetCapsuleContent(
    capsuleId,
    isUnlocked,
  );

  const [countdown, setCountdown] = useState<CountdownTime | null>(null);
  const [decryptedMessage, setDecryptedMessage] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const hasUnlockedWithKey = Boolean(decryptedMessage);
  const displayCountdown = isUnlocked
    ? { days: 0, hours: 0, minutes: 0, seconds: 0 }
    : countdown;

  const submitManualKey = () => {
    const trimmed = manualKeyInput.trim();
    if (!trimmed) {
      setDecryptError("Please paste a decryption key to continue.");
      return;
    }
    setDecryptKey(trimmed);
    setDecryptedMessage(null);
    setDecryptError(null);
    setIsKeyDialogOpen(false);
  };
  const unlockDialog = (
    <Dialog open={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen}>
      <DialogContent className="bg-card border border-primary/40 text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Unlock with decryption key
          </DialogTitle>
          <DialogDescription>
            Paste the decryption key shared with your claim link. The key stays
            in memory for this page session only.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={manualKeyInput}
          onChange={(event) => setManualKeyInput(event.target.value)}
          placeholder="Paste decryption key"
          className="bg-secondary/50 border-border/60"
          data-ocid="claim.input"
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsKeyDialogOpen(false)}
            data-ocid="claim.secondary_button"
          >
            Cancel
          </Button>
          <Button
            onClick={submitManualKey}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            data-ocid="claim.primary_button"
          >
            Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const downloadFile = useCallback(
    async (fileId: string) => {
      if (!hasUnlockedWithKey) {
        return;
      }
      if (!actor) {
        throw new Error("Not connected");
      }
      const file = await actor.getCapsuleFile(capsuleId, fileId);
      const data = file.data as Uint8Array;
      const mimeType = file.mimeType || "application/octet-stream";
      const name = file.name || `file-${fileId}`;
      const blob = new Blob([data], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    },
    [actor, capsuleId, hasUnlockedWithKey],
  );

  // Countdown timer
  useEffect(() => {
    if (!metadata || isUnlocked) return;
    const update = () => setCountdown(getCountdown(metadata.unlockDate));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [metadata, isUnlocked]);

  // Decrypt when content available
  const decrypt = useCallback(async () => {
    if (!content || !decryptKey) return;
    setIsDecrypting(true);
    setDecryptError(null);
    try {
      const msg = await decryptMessage(content.encryptedMessage, decryptKey);
      setDecryptedMessage(msg);
    } catch {
      setDecryptError(
        "Failed to decrypt — the key in the URL may be incorrect or missing.",
      );
    } finally {
      setIsDecrypting(false);
    }
  }, [content, decryptKey]);

  useEffect(() => {
    if (content && decryptKey && !decryptedMessage && !decryptError) {
      decrypt();
    }
  }, [content, decryptKey, decryptedMessage, decryptError, decrypt]);

  useEffect(() => {
    let cancelled = false;
    const decodeFileIds = async () => {
      if (!content) {
        if (!cancelled) {
          setFileIds([]);
        }
        return;
      }
      const decoded = await Promise.all(
        content.fileRefs.map(async (blob: ExternalBlob) =>
          new TextDecoder().decode(await blob.getBytes()),
        ),
      );
      if (!cancelled) {
        setFileIds(decoded.filter((idValue) => idValue.length > 0));
      }
    };

    void decodeFileIds();
    return () => {
      cancelled = true;
    };
  }, [content]);

  // ── Loading ──
  if (metaLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-16 px-4">
        <div className="text-center" data-ocid="claim.loading_state">
          <div className="w-16 h-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin mx-auto mb-6" />
          <p className="text-muted-foreground">Loading canister...</p>
        </div>
        {unlockDialog}
      </main>
    );
  }

  // ── Error ──
  if (metaError || !metadata) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-16 px-4">
        <div
          className="text-center max-w-md p-10 rounded-sm border border-destructive/30 bg-destructive/10"
          data-ocid="claim.error_state"
        >
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-6" />
          <h2 className="font-display text-2xl font-bold text-foreground mb-3">
            Canister Not Found
          </h2>
          <p className="text-muted-foreground">
            This canister doesn't exist or the link is invalid.
          </p>
        </div>
      </main>
    );
  }

  // ── TIMER STATE (before unlock or awaiting key/decrypt) ──
  if (!hasUnlockedWithKey) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center pt-16 px-4 py-12">
        <div className="max-w-lg w-full text-center" data-ocid="claim.panel">
          {/* Padlock */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-36 h-36 mx-auto mb-10"
          >
            {/* Outer glow rings */}
            <motion.div
              className="absolute inset-0 rounded-full border border-amber/20"
              animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.1, 0.4] }}
              transition={{
                repeat: Number.POSITIVE_INFINITY,
                duration: 3,
                ease: "easeInOut",
              }}
            />
            <motion.div
              className="absolute inset-4 rounded-full border border-amber/30"
              animate={{ scale: [1, 1.05, 1], opacity: [0.6, 0.2, 0.6] }}
              transition={{
                repeat: Number.POSITIVE_INFINITY,
                duration: 2.5,
                ease: "easeInOut",
                delay: 0.3,
              }}
            />
            <div className="absolute inset-8 rounded-full bg-amber/10 border-2 border-amber/40 glow-amber" />
            <Lock className="absolute inset-0 m-auto w-12 h-12 text-amber animate-float" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs font-mono-display font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
              {isUnlocked ? "TIME REACHED · KEY REQUIRED" : "SEALED · BLOCKCHAIN ENFORCED"}
            </div>

            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              This Canister is{" "}
              <span className="text-amber text-glow-amber">
                {isUnlocked ? "Ready" : "Locked"}
              </span>
            </h1>

            <p className="text-muted-foreground mb-3">
              <span className="font-medium text-foreground">
                {metadata.title}
              </span>
            </p>

            {isUnlocked ? (
              <p className="text-sm text-muted-foreground mb-10">
                Unlock time reached. Enter the decryption key to view content.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mb-10">
                Sealed and waiting. Unlocks on{" "}
                <span className="text-amber font-medium">
                  {formatDate(metadata.unlockDate)}
                </span>
              </p>
            )}

            {/* Countdown */}
            {displayCountdown && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-10"
              >
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4 flex items-center justify-center gap-2">
                  <Clock className="w-3 h-3" />
                  Time Remaining
                </p>
                <div className="flex items-center justify-center gap-3">
                  <CountdownUnit value={displayCountdown.days} label="Days" />
                  <span className="text-amber text-3xl font-bold pb-6">:</span>
                  <CountdownUnit value={displayCountdown.hours} label="Hours" />
                  <span className="text-amber text-3xl font-bold pb-6">:</span>
                  <CountdownUnit value={displayCountdown.minutes} label="Min" />
                  <span className="text-amber text-3xl font-bold pb-6">:</span>
                  <CountdownUnit value={displayCountdown.seconds} label="Sec" />
                </div>
              </motion.div>
            )}

            {isUnlocked && !isDecrypting && (
              <div className="mb-10 flex justify-center">
                <Button
                  variant="outline"
                  className="border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => setIsKeyDialogOpen(true)}
                  data-ocid="claim.secondary_button"
                >
                  Unlock with key
                </Button>
              </div>
            )}

            {decryptError && (
              <p className="text-destructive text-sm mb-6">{decryptError}</p>
            )}

            <p className="text-xs text-muted-foreground border-t border-border/30 pt-6">
              This canister's unlock time is enforced by the Internet Computer
              blockchain.
              <br />
              No one — not even the creator — can access it before this date.
            </p>
          </motion.div>
        </div>
        {unlockDialog}
      </main>
    );
  }

  // ── DECRYPTED CONTENT STATE ──
  return (
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-2xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
          data-ocid="claim.panel"
        >
          {/* Unlock animation */}
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full bg-primary/10 animate-seal-glow" />
            <div className="absolute inset-2 rounded-full bg-primary/20 border border-primary/40" />
            <Unlock className="absolute inset-0 m-auto w-10 h-10 text-primary" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-mono-display font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            UNLOCKED
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
            {metadata.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Sealed on {formatDate(metadata.createdDate)} · Unlocked{" "}
            {formatDate(metadata.unlockDate)}
          </p>
        </motion.div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {contentLoading || isDecrypting ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
              data-ocid="claim.loading_state"
            >
              <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">
                {isDecrypting
                  ? "Decrypting your message..."
                  : "Loading content..."}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Message */}
              {decryptedMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="p-8 rounded-sm border border-primary/20 bg-card/80 backdrop-blur-sm"
                  data-ocid="claim.panel"
                >
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Unlock className="w-3 h-3 text-primary" />
                    Decrypted Message
                  </p>
                  <div className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {decryptedMessage}
                  </div>
                </motion.div>
              )}

              {/* Files */}
              {content && hasUnlockedWithKey && fileIds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="p-6 rounded-sm border border-border/60 bg-card/80"
                >
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                    Attached Files ({fileIds.length})
                  </p>
                  <div className="space-y-2">
                    {fileIds.map((fileId: string, i: number) => (
                      <FileRefItem
                        key={fileId}
                        fileId={fileId}
                        index={i}
                        onDownload={downloadFile}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {unlockDialog}
    </main>
  );
}
