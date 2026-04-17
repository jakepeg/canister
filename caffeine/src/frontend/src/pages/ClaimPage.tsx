import { Button } from "@/components/ui/button";
import { useParams } from "@tanstack/react-router";
import { AlertTriangle, Clock, Download, Lock, Unlock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type { ExternalBlob } from "../backend";
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
  blob,
  index,
}: {
  blob: ExternalBlob;
  index: number;
}) {
  const ocid = `claim.item.${index + 1}` as const;
  const btnOcid = "claim.secondary_button" as const;
  return (
    <div
      className="flex items-center justify-between p-3 rounded-sm border border-border/40 bg-secondary/30"
      data-ocid={ocid}
    >
      <span className="text-sm text-foreground">File {index + 1}</span>
      <a
        href={blob.getDirectURL()}
        download
        target="_blank"
        rel="noopener noreferrer"
        data-ocid={btnOcid}
      >
        <Button
          size="sm"
          variant="outline"
          className="border-primary/30 text-primary hover:bg-primary/10"
        >
          <Download className="w-3 h-3 mr-1.5" />
          Download
        </Button>
      </a>
    </div>
  );
}

export default function ClaimPage() {
  const { id } = useParams({ from: "/claim/$id" });
  const capsuleId = BigInt(id);

  // Extract key from URL hash
  const [decryptKey] = useState<string>(() => window.location.hash.slice(1));

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

  // ── Loading ──
  if (metaLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-16 px-4">
        <div className="text-center" data-ocid="claim.loading_state">
          <div className="w-16 h-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin mx-auto mb-6" />
          <p className="text-muted-foreground">Loading canister...</p>
        </div>
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

  // ── LOCKED STATE ──
  if (!isUnlocked) {
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
              SEALED · BLOCKCHAIN ENFORCED
            </div>

            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              This Canister is{" "}
              <span className="text-amber text-glow-amber">Locked</span>
            </h1>

            <p className="text-muted-foreground mb-3">
              <span className="font-medium text-foreground">
                {metadata.title}
              </span>
            </p>

            <p className="text-sm text-muted-foreground mb-10">
              Sealed and waiting. Unlocks on{" "}
              <span className="text-amber font-medium">
                {formatDate(metadata.unlockDate)}
              </span>
            </p>

            {/* Countdown */}
            {countdown && (
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
                  <CountdownUnit value={countdown.days} label="Days" />
                  <span className="text-amber text-3xl font-bold pb-6">:</span>
                  <CountdownUnit value={countdown.hours} label="Hours" />
                  <span className="text-amber text-3xl font-bold pb-6">:</span>
                  <CountdownUnit value={countdown.minutes} label="Min" />
                  <span className="text-amber text-3xl font-bold pb-6">:</span>
                  <CountdownUnit value={countdown.seconds} label="Sec" />
                </div>
              </motion.div>
            )}

            <p className="text-xs text-muted-foreground border-t border-border/30 pt-6">
              This canister's unlock time is enforced by the Internet Computer
              blockchain.
              <br />
              No one — not even the creator — can access it before this date.
            </p>
          </motion.div>
        </div>
      </main>
    );
  }

  // ── UNLOCKED STATE ──
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
          ) : decryptError ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-sm border border-destructive/30 bg-destructive/10 text-center"
              data-ocid="claim.error_state"
            >
              <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
              <p className="text-destructive text-sm">{decryptError}</p>
              {!decryptKey && (
                <p className="text-muted-foreground text-xs mt-2">
                  The claim link must include the decryption key after the #
                  symbol.
                </p>
              )}
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

              {/* No key — show notice */}
              {!decryptKey && content && (
                <div
                  className="p-6 rounded-sm border border-amber/20 bg-amber/5"
                  data-ocid="claim.panel"
                >
                  <p className="text-sm text-amber">
                    ⚠ No decryption key found in the URL. The message cannot be
                    displayed. Ensure you're using the full claim link.
                  </p>
                </div>
              )}

              {/* Files */}
              {content && content.fileRefs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="p-6 rounded-sm border border-border/60 bg-card/80"
                >
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                    Attached Files ({content.fileRefs.length})
                  </p>
                  <div className="space-y-2">
                    {content.fileRefs.map((blob: ExternalBlob, i: number) => (
                      <FileRefItem
                        key={blob.getDirectURL()}
                        blob={blob}
                        index={i}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
