import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  Calendar,
  Download,
  Lock,
  LogIn,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalBlob, type CapsuleMetadata } from "../backend";
import { encryptBytesWithAesGcm } from "../lib/capsuleCrypto";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useActor } from "../hooks/useActor";
import {
  useAppendCapsuleFiles,
  useDeleteCapsule,
  useGetMyCapsules,
  useCapsuleNotificationPreferences,
  useLockCapsule,
  useSaveCapsuleNotificationPreferences,
  useUpdateCapsuleTitle,
  type ReminderTarget,
} from "../hooks/useQueries";
import {
  buildUnlockCalendarLinks,
  triggerIcsDownload,
} from "../utils/unlockCalendar";

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
  onOpen,
  onRename,
  onReminderEmails,
  onDelete,
  onFinalizeDraft,
  onAddDraftFiles,
}: {
  capsule: CapsuleMetadata;
  index: number;
  onOpen: () => void;
  onRename: () => void;
  onReminderEmails: () => void;
  onDelete: () => void;
  onFinalizeDraft?: () => void;
  onAddDraftFiles?: () => void;
}) {
  const isDraft = !capsule.contentLocked;
  const unlocked = capsule.isUnlocked;
  const unlockDate = new Date(Number(capsule.unlockDate / 1_000_000n));
  const now = new Date();
  const isOverdue = !isDraft && unlockDate <= now && !unlocked;

  const showAddToCalendar =
    !unlocked && Number(capsule.unlockDate / 1_000_000n) > Date.now();

  const calendarLinks = useMemo(() => {
    if (!showAddToCalendar) return null;
    return buildUnlockCalendarLinks({
      unlockDateNs: capsule.unlockDate,
      title: capsule.title,
      capsuleId: capsule.id,
    });
  }, [showAddToCalendar, capsule.unlockDate, capsule.title, capsule.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      className="w-full rounded-sm border bg-card/80 transition-all group
        border-border/60 hover:border-primary/40 hover:glow-cyan"
      data-ocid={`dashboard.item.${index + 1}`}
    >
      <div className="flex items-stretch justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left p-6 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
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
              className={`shrink-0 font-mono-display text-xs rounded-sm mt-1 ${
                isDraft
                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-400/40 border"
                  : unlocked
                    ? "bg-primary/15 text-primary border-primary/30 border"
                    : isOverdue
                      ? "bg-amber/20 text-amber border-amber/40 border animate-pulse"
                      : "bg-amber/10 text-amber border-amber/20 border"
              }`}
            >
              {isDraft ? "DRAFT" : unlocked ? "UNLOCKED" : isOverdue ? "READY" : "LOCKED"}
            </Badge>
          </div>
        </button>

        <div className="flex items-start p-3 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-sm"
                aria-label="Canister actions"
                onClick={(e) => e.stopPropagation()}
                data-ocid={`dashboard.item.${index + 1}.menu`}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRename();
                }}
              >
                <Pencil className="w-4 h-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onReminderEmails();
                }}
              >
                <Mail className="w-4 h-4" />
                Reminder emails
              </DropdownMenuItem>
              {calendarLinks && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Calendar className="w-4 h-4" />
                    Add to calendar
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem asChild>
                      <a
                        href={calendarLinks.googleCalendarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Calendar className="w-4 h-4" />
                        Google Calendar
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerIcsDownload(
                          calendarLinks.icsContent,
                          calendarLinks.suggestedFilename,
                        );
                      }}
                    >
                      <Download className="w-4 h-4" />
                      Download .ics
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {isDraft && onFinalizeDraft && onAddDraftFiles && (
        <div className="flex flex-wrap gap-2 px-6 pb-6 pt-0 border-t border-border/50 bg-secondary/20">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddDraftFiles();
            }}
            data-ocid={`dashboard.item.${index + 1}.add_files`}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add files
          </Button>
          <Button
            type="button"
            size="sm"
            variant="utility"
            className="rounded-sm"
            onClick={(e) => {
              e.stopPropagation();
              onFinalizeDraft();
            }}
            data-ocid={`dashboard.item.${index + 1}.finalize`}
          >
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Finalize
          </Button>
        </div>
      )}
    </motion.div>
  );
}

export default function Dashboard() {
  const { identity, login } = useInternetIdentity();
  const { actor } = useActor();
  const navigate = useNavigate();
  const { data: capsules, isLoading, isError } = useGetMyCapsules();
  const deleteCapsuleMutation = useDeleteCapsule();
  const updateTitleMutation = useUpdateCapsuleTitle();
  const saveCapsulePrefsMutation = useSaveCapsuleNotificationPreferences();
  const lockCapsuleMutation = useLockCapsule();
  const appendCapsuleFilesMutation = useAppendCapsuleFiles();

  const [prefsCapsule, setPrefsCapsule] = useState<CapsuleMetadata | null>(null);
  const prefsQuery = useCapsuleNotificationPreferences(prefsCapsule?.id ?? null);

  const [ownerEmail, setOwnerEmail] = useState("");
  const [reminderTarget, setReminderTarget] = useState<ReminderTarget>("owner");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [reminderOptIn, setReminderOptIn] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [notifyRecipientOnCreation, setNotifyRecipientOnCreation] = useState(false);
  const [hasRecipientPermission, setHasRecipientPermission] = useState(false);

  const [renameTarget, setRenameTarget] = useState<CapsuleMetadata | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CapsuleMetadata | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [appendTarget, setAppendTarget] = useState<CapsuleMetadata | null>(null);
  const [appendFiles, setAppendFiles] = useState<File[]>([]);
  const [appendCapsuleKey, setAppendCapsuleKey] = useState("");
  const appendFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (deleteTarget) {
      setDeleteConfirm("");
    }
  }, [deleteTarget]);

  useEffect(() => {
    if (!prefsCapsule) return;
    if (prefsQuery.isLoading) return;
    const p = prefsQuery.data;
    if (p) {
      setOwnerEmail(p.ownerEmail);
      setReminderTarget(p.reminderTarget);
      setRecipientEmail(p.recipientEmail ?? "");
      setReminderOptIn(p.reminderOptIn);
      setMarketingOptIn(p.marketingOptIn);
      setNotifyRecipientOnCreation(p.notifyRecipientOnCreation);
      setHasRecipientPermission(p.hasRecipientPermission);
    } else {
      setOwnerEmail("");
      setReminderTarget("owner");
      setRecipientEmail("");
      setReminderOptIn(true);
      setMarketingOptIn(false);
      setNotifyRecipientOnCreation(false);
      setHasRecipientPermission(false);
    }
  }, [prefsCapsule, prefsQuery.data, prefsQuery.isLoading]);

  async function submitRename() {
    if (!renameTarget) return;
    const t = renameTitle.trim();
    if (!t) {
      toast.error("Title cannot be empty.");
      return;
    }
    try {
      await updateTitleMutation.mutateAsync({
        publicId: renameTarget.id,
        title: t,
      });
      toast.success("Canister renamed.");
      setRenameTarget(null);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to rename.");
    }
  }

  async function submitReminderPrefs() {
    if (!prefsCapsule) return;
    const oe = ownerEmail.trim();
    if (!oe) {
      toast.error("Enter an owner email.");
      return;
    }
    try {
      await saveCapsulePrefsMutation.mutateAsync({
        publicId: prefsCapsule.id,
        ownerEmail: oe,
        reminderTarget,
        recipientEmail: reminderTarget === "other" ? recipientEmail.trim() : undefined,
        reminderOptIn,
        marketingOptIn,
        notifyRecipientOnCreation:
          reminderTarget === "other" ? notifyRecipientOnCreation : false,
        hasRecipientPermission:
          reminderTarget === "other" ? hasRecipientPermission : false,
      });
      toast.success("Reminder preferences saved.");
      setPrefsCapsule(null);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save preferences.",
      );
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    if (deleteConfirm.trim() !== deleteTarget.id) return;
    try {
      await deleteCapsuleMutation.mutateAsync(deleteTarget.id);
      toast.success("Canister deleted.");
      setDeleteTarget(null);
      setDeleteConfirm("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to delete.");
    }
  }

  async function finalizeDraftCapsule(capsule: CapsuleMetadata) {
    try {
      await lockCapsuleMutation.mutateAsync(capsule.id);
      toast.success(
        "Canister finalized. Share your claim link — content is sealed until the unlock date.",
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to finalize.");
    }
  }

  async function submitAppendFiles() {
    if (!appendTarget || !actor) return;
    if (appendFiles.length === 0) {
      toast.error("Choose at least one file.");
      return;
    }
    const keyTrim = appendCapsuleKey.trim();
    const enc = appendTarget.attachmentsEncrypted;
    let filesEncryptedFlag = enc;
    if (!enc && appendFiles.length > 0 && keyTrim.length > 0) {
      filesEncryptedFlag = true;
    }
    if (enc && !keyTrim) {
      toast.error(
        "Paste your decryption key (same as after # in the claim link) to add files.",
      );
      return;
    }
    if (filesEncryptedFlag && !keyTrim) {
      toast.error("Paste your decryption key to encrypt these uploads.");
      return;
    }
    const encoder = new TextEncoder();
    const fileBlobs: ExternalBlob[] = [];
    try {
      for (const file of appendFiles) {
        const buf = await file.arrayBuffer();
        let payload = new Uint8Array(buf);
        if (filesEncryptedFlag) {
          payload = new Uint8Array(
            await encryptBytesWithAesGcm(payload, keyTrim),
          );
        }
        const id = await actor.uploadCapsuleFile(
          file.name,
          file.type || "application/octet-stream",
          payload,
        );
        fileBlobs.push(ExternalBlob.fromBytes(encoder.encode(id)));
      }
      await appendCapsuleFilesMutation.mutateAsync({
        publicId: appendTarget.id,
        fileRefs: fileBlobs,
        filesEncrypted: filesEncryptedFlag,
      });
      toast.success(
        appendFiles.length === 1
          ? "File attached."
          : `${appendFiles.length} files attached.`,
      );
      setAppendTarget(null);
      setAppendFiles([]);
      setAppendCapsuleKey("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to add files.");
    }
  }

  useEffect(() => {
    if (appendTarget) {
      setAppendFiles([]);
      setAppendCapsuleKey("");
      if (appendFileInputRef.current) {
        appendFileInputRef.current.value = "";
      }
    }
  }, [appendTarget]);

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
            variant="utility"
            className="w-full glow-cyan rounded-sm"
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
              variant="utility"
              className="glow-cyan rounded-sm"
              data-ocid="dashboard.primary_button"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Canister
            </Button>
          </motion.div>
        </div>

        {isLoading && (
          <div className="space-y-4" data-ocid="dashboard.loading_state">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-sm bg-card/60" />
            ))}
          </div>
        )}

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
              variant="utility"
              className="glow-cyan rounded-sm"
              data-ocid="dashboard.primary_button"
            >
              Create Your First Canister
            </Button>
          </motion.div>
        )}

        {!isLoading && !isError && capsules && capsules.length > 0 && (
          <div className="space-y-4" data-ocid="dashboard.list">
            {capsules.map((capsule: CapsuleMetadata, i) => (
              <CapsuleCard
                key={capsule.id}
                capsule={capsule}
                index={i}
                onOpen={() =>
                  navigate({
                    to: "/claim/$id",
                    params: { id: capsule.id },
                  })
                }
                onRename={() => {
                  setRenameTarget(capsule);
                  setRenameTitle(capsule.title);
                }}
                onReminderEmails={() => setPrefsCapsule(capsule)}
                onDelete={() => setDeleteTarget(capsule)}
                onFinalizeDraft={
                  !capsule.contentLocked
                    ? () => void finalizeDraftCapsule(capsule)
                    : undefined
                }
                onAddDraftFiles={
                  !capsule.contentLocked ? () => setAppendTarget(capsule) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={appendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAppendTarget(null);
        }}
      >
        <DialogContent className="bg-card border-border/60">
          <DialogHeader>
            <DialogTitle>Add files to draft</DialogTitle>
            <DialogDescription>
              Uploads are stored on-chain and count toward your plan limits. Finalize the canister
              when you are done editing.
              {appendTarget?.attachmentsEncrypted
                ? " Encrypted drafts require your decryption key to upload matching ciphertext."
                : " Paste your claim-link key if you want new files encrypted like the sealed message."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="append-key">Decryption key (optional unless encrypted)</Label>
            <Input
              id="append-key"
              type="password"
              autoComplete="off"
              value={appendCapsuleKey}
              onChange={(e) => setAppendCapsuleKey(e.target.value)}
              placeholder="Same base64 key as after # in your claim URL"
              className="bg-secondary/50 border-border/60"
            />
          </div>
          <input
            ref={appendFileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const list = event.target.files;
              setAppendFiles(list?.length ? Array.from(list) : []);
            }}
          />
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-sm"
              onClick={() => appendFileInputRef.current?.click()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Choose files
            </Button>
            {appendFiles.length > 0 && (
              <ul className="text-sm text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {appendFiles.map((f) => (
                  <li key={`${f.name}-${f.size}`} className="truncate">
                    {f.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAppendTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="sales"
              onClick={() => void submitAppendFiles()}
              disabled={
                appendFiles.length === 0 || appendCapsuleFilesMutation.isPending
              }
            >
              {appendCapsuleFilesMutation.isPending ? "Uploading…" : "Attach"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="bg-card border-border/60">
          <DialogHeader>
            <DialogTitle>Rename canister</DialogTitle>
            <DialogDescription>
              Update the display title. The canister ID used in links does not change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-title">Title</Label>
            <Input
              id="rename-title"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Title"
              className="bg-secondary/50 border-border/60"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="sales"
              onClick={() => void submitRename()}
              disabled={
                !renameTitle.trim() || updateTitleMutation.isPending
              }
            >
              {updateTitleMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={prefsCapsule !== null}
        onOpenChange={(open) => {
          if (!open) setPrefsCapsule(null);
        }}
      >
        <DialogContent className="bg-card border-border/60 max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reminder emails</DialogTitle>
            <DialogDescription>
              Owner email and reminder settings for this canister. Unlock and retention notices use
              these addresses when enabled.
            </DialogDescription>
          </DialogHeader>
          {prefsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading preferences…</p>
          )}
          {!prefsQuery.isLoading && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dash-owner-email" className="text-xs text-foreground/80">
                  Owner email
                </Label>
                <Input
                  id="dash-owner-email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-secondary/50 border-border/60"
                />
              </div>
              <div className="space-y-3 rounded-sm border border-border/50 p-3">
                <label className="flex items-start gap-2 text-xs text-foreground/80">
                  <Checkbox
                    checked={marketingOptIn}
                    onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
                  />
                  <span>I agree to marketing emails at owner email (with unsubscribe).</span>
                </label>
              </div>
              <div className="space-y-3 rounded-sm border border-border/40 bg-secondary/20 p-4">
                <p className="text-sm font-medium text-foreground">Reminder preferences</p>
                <div className="space-y-2">
                  <Label className="text-xs text-foreground/80">Send reminders to</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={reminderTarget === "owner" ? "sales" : "outline"}
                      size="sm"
                      onClick={() => {
                        setReminderTarget("owner");
                        setRecipientEmail("");
                        setNotifyRecipientOnCreation(false);
                        setHasRecipientPermission(false);
                      }}
                    >
                      Me (owner)
                    </Button>
                    <Button
                      type="button"
                      variant={reminderTarget === "other" ? "sales" : "outline"}
                      size="sm"
                      onClick={() => {
                        setReminderTarget("other");
                        setNotifyRecipientOnCreation(true);
                      }}
                    >
                      Someone else
                    </Button>
                  </div>
                </div>
                <div className="space-y-3 rounded-sm border border-border/50 p-3">
                  <label className="flex items-start gap-2 text-xs text-foreground/80">
                    <Checkbox
                      checked={reminderOptIn}
                      onCheckedChange={(checked) => setReminderOptIn(checked === true)}
                    />
                    <span>I agree to reminder emails related to this capsule.</span>
                  </label>
                </div>
                {reminderTarget === "other" && reminderOptIn && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="dash-recipient-email" className="text-xs text-foreground/80">
                        Recipient email
                      </Label>
                      <Input
                        id="dash-recipient-email"
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="recipient@example.com"
                        className="bg-secondary/50 border-border/60"
                      />
                    </div>
                    <div className="space-y-3 rounded-sm border border-border/50 p-3">
                      <label className="flex items-start gap-2 text-xs text-foreground/80">
                        <Checkbox
                          checked={notifyRecipientOnCreation}
                          onCheckedChange={(checked) =>
                            setNotifyRecipientOnCreation(checked === true)
                          }
                        />
                        <span>Notify recipient now when this capsule is created.</span>
                      </label>
                      <label className="flex items-start gap-2 text-xs text-foreground/80">
                        <Checkbox
                          checked={hasRecipientPermission}
                          onCheckedChange={(checked) =>
                            setHasRecipientPermission(checked === true)
                          }
                        />
                        <span>I confirm I have permission to email this recipient.</span>
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPrefsCapsule(null)}>
              Cancel
            </Button>
            <Button
              variant="sales"
              onClick={() => void submitReminderPrefs()}
              disabled={
                prefsQuery.isLoading ||
                saveCapsulePrefsMutation.isPending ||
                !ownerEmail.trim()
              }
            >
              {saveCapsulePrefsMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
      >
        <DialogContent className="bg-card border-border/60 border-destructive/20">
          <DialogHeader>
            <DialogTitle>Delete canister</DialogTitle>
            <DialogDescription>
              This permanently removes the sealed message, attachments, and claim link. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Type the canister ID to confirm:
              </p>
              <code className="block text-xs font-mono break-all rounded-sm border border-border/50 bg-secondary/30 p-2">
                {deleteTarget.id}
              </code>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">Canister ID</Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Paste canister ID"
                  className="bg-secondary/50 border-border/60 font-mono text-sm"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirm("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitDelete()}
              disabled={
                !deleteTarget ||
                deleteConfirm.trim() !== deleteTarget.id ||
                deleteCapsuleMutation.isPending
              }
            >
              {deleteCapsuleMutation.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
