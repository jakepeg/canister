import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Gem,
  LayoutDashboard,
  Lock,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalBlob } from "../backend";
import QRCode from "../components/QRCode";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useCreateCapsule } from "../hooks/useQueries";

const STEPS = [
  { id: 1, label: "Message", icon: <FileText className="w-4 h-4" /> },
  { id: 2, label: "Files", icon: <Upload className="w-4 h-4" /> },
  { id: 3, label: "Schedule", icon: <Calendar className="w-4 h-4" /> },
  { id: 4, label: "Review", icon: <Eye className="w-4 h-4" /> },
];

interface SelectedFile {
  file: File;
  id: string;
}

async function encryptMessage(
  message: string,
): Promise<{ encryptedMessage: string; keyBase64: string }> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  const encryptedMessage = btoa(String.fromCharCode(...combined));
  const rawKey = await crypto.subtle.exportKey("raw", key);
  const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
  return { encryptedMessage, keyBase64 };
}

export default function CreateCapsule() {
  const { identity, login } = useInternetIdentity();
  const navigate = useNavigate();
  const createCapsule = useCreateCapsule();

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [unlockDate, setUnlockDate] = useState("");

  const [isSealing, setIsSealing] = useState(false);
  const [sealingStage, setSealingStage] = useState(0);
  const [sealed, setSealed] = useState(false);
  const [claimUrl, setClaimUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!identity) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md p-10 rounded-sm border border-border/60 bg-card/80"
          data-ocid="create.panel"
        >
          <Lock className="w-12 h-12 text-primary mx-auto mb-6 opacity-80" />
          <h2 className="font-display text-3xl font-bold text-foreground mb-3">
            Connect to continue
          </h2>
          <p className="text-muted-foreground mb-8">
            You need a connected wallet to seal a canister on the blockchain.
          </p>
          <Button
            onClick={login}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan rounded-sm"
            data-ocid="create.primary_button"
          >
            Connect Wallet
          </Button>
        </motion.div>
      </main>
    );
  }

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().slice(0, 16);

  const unlockDateObj = unlockDate ? new Date(unlockDate) : null;
  const daysUntil = unlockDateObj
    ? Math.ceil((unlockDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const totalFileSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const totalFileSizeMB = (totalFileSize / (1024 * 1024)).toFixed(2);

  function handleFileAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files || []);
    const withIds = newFiles.map((f) => ({
      file: f,
      id: Math.random().toString(36).slice(2),
    }));
    setFiles((prev) => [...prev, ...withIds]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function canAdvance() {
    if (step === 1) return title.trim().length > 0 && message.trim().length > 0;
    if (step === 2) return true;
    if (step === 3) return !!unlockDate && new Date(unlockDate) > new Date();
    return true;
  }

  const SEALING_STAGES = [
    "Encrypting your message...",
    "Uploading files to decentralized storage...",
    "Sealing canister on the blockchain...",
    "Confirming transaction...",
  ];

  async function handleSeal() {
    if (!identity) return;
    setIsSealing(true);
    setSealingStage(0);

    try {
      // Stage 0: encrypt
      const { encryptedMessage, keyBase64 } = await encryptMessage(message);
      setSealingStage(1);

      // Stage 1: prepare files
      const fileBlobs: ExternalBlob[] = [];
      for (const sf of files) {
        const arrayBuffer = await sf.file.arrayBuffer();
        const blob = ExternalBlob.fromBytes(new Uint8Array(arrayBuffer));
        fileBlobs.push(blob);
      }
      setSealingStage(2);

      // Stage 2: create on-chain
      const unlockDateBigInt =
        BigInt(new Date(unlockDate).getTime()) * 1_000_000n;
      const capsuleId = await createCapsule.mutateAsync({
        title,
        encryptedMessage,
        fileRefs: fileBlobs,
        unlockDate: unlockDateBigInt,
      });
      setSealingStage(3);

      // Build claim URL
      const url = `${window.location.origin}/claim/${capsuleId.toString()}#${keyBase64}`;
      setClaimUrl(url);

      await new Promise((r) => setTimeout(r, 800));
      setIsSealing(false);
      setSealed(true);
    } catch (err) {
      setIsSealing(false);
      toast.error(
        err instanceof Error ? err.message : "Failed to seal canister",
      );
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(claimUrl);
    toast.success("Claim link copied!");
  }

  // ── Sealed success screen ──
  if (sealed) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-16 px-4 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-lg w-full text-center"
          data-ocid="create.success_state"
        >
          {/* Success icon */}
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full bg-primary/10 animate-seal-glow" />
            <div className="absolute inset-2 rounded-full bg-primary/20 border border-primary/40" />
            <CheckCircle2 className="absolute inset-0 m-auto w-10 h-10 text-primary" />
          </div>

          <h1 className="font-display text-4xl font-bold text-foreground mb-3">
            Your Canister is{" "}
            <span className="text-primary text-glow-cyan">Sealed!</span>
          </h1>
          <p className="text-muted-foreground mb-8">
            It's now permanently stored on the blockchain. Share the claim link
            — it contains the decryption key.
          </p>

          <div className="p-6 rounded-sm border border-border/60 bg-card/80 mb-6 text-left">
            <p className="text-xs text-muted-foreground font-mono-display mb-3 uppercase tracking-wider">
              Claim URL — Keep this safe
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-primary font-mono-display break-all bg-primary/5 p-2 rounded border border-primary/20 leading-relaxed">
                {claimUrl}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={copyLink}
                className="shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                data-ocid="create.secondary_button"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* QR */}
          <div className="flex justify-center mb-8">
            <div className="p-4 rounded-sm border border-border/60 bg-card/80 inline-block">
              <QRCode value={claimUrl} size={180} className="rounded" />
              <p className="text-xs text-muted-foreground mt-2">
                Scan to claim
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-amber/40 text-amber hover:bg-amber/10 glow-amber rounded-sm"
                  data-ocid="create.open_modal_button"
                >
                  <Gem className="w-4 h-4 mr-2" />
                  Order Keepsake
                </Button>
              </DialogTrigger>
              <DialogContent
                className="bg-card border-border/60 text-foreground"
                data-ocid="keepsake.dialog"
              >
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl text-amber">
                    Physical Canister Keepsake
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Coming soon — a custom pendant engraved with your canister's
                    QR code.
                  </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground py-4">
                  Physical keepsake ordering is coming soon. We'll notify you
                  when it launches.
                </p>
                <Button
                  className="w-full bg-amber/20 text-amber border border-amber/40 hover:bg-amber/30 rounded-sm"
                  data-ocid="keepsake.confirm_button"
                >
                  Notify Me
                </Button>
              </DialogContent>
            </Dialog>

            <Button
              onClick={() => navigate({ to: "/dashboard" })}
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan rounded-sm"
              data-ocid="create.primary_button"
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>
        </motion.div>
      </main>
    );
  }

  // ── Sealing animation ──
  if (isSealing) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-16 px-4">
        <div className="text-center" data-ocid="create.loading_state">
          {/* Animated seal */}
          <div className="relative w-36 h-36 mx-auto mb-10">
            <div className="absolute inset-0 rounded-full animate-seal-glow bg-primary/5 border border-primary/20" />
            <div className="absolute inset-3 rounded-full bg-primary/10 border border-primary/30 animate-seal-pulse" />
            <div className="absolute inset-6 rounded-full bg-primary/20 border-2 border-primary/50" />
            <Lock className="absolute inset-0 m-auto w-10 h-10 text-primary animate-bounce" />

            {/* Orbit ring */}
            <div
              className="absolute inset-0 rounded-full border border-primary/20"
              style={{
                animation: "spin 3s linear infinite",
                borderTopColor: "oklch(0.72 0.17 207)",
              }}
            />
          </div>

          <h2 className="font-display text-3xl font-bold text-foreground mb-3">
            Sealing your memories
          </h2>
          <p className="text-primary font-mono-display text-sm mb-6">
            {SEALING_STAGES[sealingStage]}
          </p>

          {/* Stage progress */}
          <div className="flex justify-center gap-2">
            {SEALING_STAGES.map((stage, i) => (
              <div
                key={stage}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i <= sealingStage ? "w-8 bg-primary" : "w-4 bg-border"
                }`}
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            Broadcasting to the Internet Computer network...
          </p>
        </div>
      </main>
    );
  }

  // ── Multi-step form ──
  return (
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-2xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">
            Create a Canister
          </h1>
          <p className="text-muted-foreground">
            Seal a message on the blockchain, locked until the moment you
            choose.
          </p>
        </motion.div>

        {/* Step indicator */}
        <div
          className="flex items-center gap-0 mb-10"
          role="tablist"
          aria-label="Form steps"
        >
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                role="tab"
                aria-selected={step === s.id}
                disabled={s.id > step}
                onClick={() => s.id < step && setStep(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-sm text-sm font-medium transition-all ${
                  step === s.id
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : s.id < step
                      ? "text-primary/70 hover:text-primary cursor-pointer"
                      : "text-muted-foreground cursor-not-allowed opacity-40"
                }`}
                data-ocid={"create.tab"}
              >
                {s.icon}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.id}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-1 transition-colors ${
                    s.id < step ? "bg-primary/40" : "bg-border/40"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="p-8 rounded-sm border border-border/60 bg-card/80 backdrop-blur-sm mb-6"
            data-ocid="create.panel"
          >
            {/* Step 1: Message */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <Label
                    htmlFor="title"
                    className="text-foreground font-medium mb-2 block"
                  >
                    Title
                  </Label>
                  <Input
                    id="title"
                    placeholder="A letter to my future self..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-secondary/50 border-border/60 focus:border-primary/60 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
                    data-ocid="create.input"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="message"
                    className="text-foreground font-medium mb-2 block"
                  >
                    Your Message
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Dear future me, by the time you read this..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={10}
                    className="bg-secondary/50 border-border/60 focus:border-primary/60 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground resize-none leading-relaxed"
                    data-ocid="create.textarea"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {message.length} characters · Encrypted with AES-256 before
                    leaving your device
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Files */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">
                    Attach Files
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Optional — images, documents, or media. Max 100MB total.
                  </p>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 rounded-sm p-8 text-center transition-all group cursor-pointer"
                    data-ocid="create.dropzone"
                  >
                    <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary mx-auto mb-3 transition-colors" />
                    <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      Click to select files
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Any file type · Up to 100MB
                    </p>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileAdd}
                    data-ocid="create.upload_button"
                  />
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      {files.length} file{files.length > 1 ? "s" : ""} ·{" "}
                      {totalFileSizeMB} MB
                    </p>
                    {files.map((f, i) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between p-3 rounded-sm border border-border/40 bg-secondary/30"
                        data-ocid={`create.item.${i + 1}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm text-foreground truncate">
                            {f.file.name}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {(f.file.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(f.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                          data-ocid={`create.delete_button.${i + 1}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {files.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-2">
                    No files attached · You can proceed without files
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Schedule */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">
                    Set Unlock Date
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    The canister becomes accessible to recipients on this date.
                    The blockchain enforces this — no early access is possible.
                  </p>

                  <Label
                    htmlFor="unlockDate"
                    className="text-foreground font-medium mb-2 block"
                  >
                    Unlock Date & Time
                  </Label>
                  <Input
                    id="unlockDate"
                    type="datetime-local"
                    min={minDateStr}
                    value={unlockDate}
                    onChange={(e) => setUnlockDate(e.target.value)}
                    className="bg-secondary/50 border-border/60 focus:border-primary/60 text-foreground [color-scheme:dark]"
                    data-ocid="create.input"
                  />
                </div>

                {daysUntil !== null && daysUntil > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 rounded-sm border border-primary/30 bg-primary/5 text-center"
                  >
                    <p className="text-sm text-muted-foreground mb-2">
                      This canister unlocks in
                    </p>
                    <p className="font-display text-5xl font-bold text-primary text-glow-cyan">
                      {daysUntil}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">days</p>
                    <p className="text-xs text-muted-foreground mt-3">
                      {new Date(unlockDate).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </motion.div>
                )}
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-semibold text-foreground mb-4">
                    Review Your Canister
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-3 border-b border-border/30">
                      <span className="text-sm text-muted-foreground">
                        Title
                      </span>
                      <span className="text-sm text-foreground font-medium">
                        {title}
                      </span>
                    </div>
                    <div className="py-3 border-b border-border/30">
                      <span className="text-sm text-muted-foreground block mb-2">
                        Message preview
                      </span>
                      <p className="text-sm text-foreground line-clamp-3 leading-relaxed">
                        {message}
                      </p>
                    </div>
                    <div className="flex justify-between py-3 border-b border-border/30">
                      <span className="text-sm text-muted-foreground">
                        Attachments
                      </span>
                      <span className="text-sm text-foreground">
                        {files.length} file{files.length !== 1 ? "s" : ""}{" "}
                        {files.length > 0 && `(${totalFileSizeMB} MB)`}
                      </span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-border/30">
                      <span className="text-sm text-muted-foreground">
                        Unlock date
                      </span>
                      <span className="text-sm text-primary font-medium">
                        {new Date(unlockDate).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-border/30">
                      <span className="text-sm text-muted-foreground">
                        Locks in
                      </span>
                      <span className="text-sm text-amber font-medium">
                        {daysUntil} days
                      </span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="text-sm text-muted-foreground">
                        Encryption
                      </span>
                      <span className="text-sm text-primary flex items-center gap-1">
                        <Lock className="w-3 h-3" /> AES-256-GCM
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-sm border border-amber/20 bg-amber/5">
                  <p className="text-xs text-amber/80">
                    ⚠ Once sealed, this canister is{" "}
                    <strong className="text-amber">
                      immutable and permanent
                    </strong>
                    . The unlock date and content cannot be changed or deleted.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => step > 1 && setStep((s) => s - 1)}
            disabled={step === 1}
            className="text-muted-foreground hover:text-foreground"
            data-ocid="create.secondary_button"
          >
            Back
          </Button>

          {step < 4 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan rounded-sm disabled:opacity-40"
              data-ocid="create.primary_button"
            >
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSeal}
                disabled={createCapsule.isPending}
                className="px-8 bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan-lg rounded-sm font-semibold"
                data-ocid="create.submit_button"
              >
                <Lock className="w-4 h-4 mr-2" />
                Seal Canister
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
