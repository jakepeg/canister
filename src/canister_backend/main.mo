import Map "mo:core/Map";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Time "mo:core/Time";
import Principal "mo:core/Principal";
import Order "mo:core/Order";
import Runtime "mo:core/Runtime";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat16 "mo:core/Nat16";
import Int "mo:core/Int";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import MixinStorage "blob-storage/Mixin";
import Storage "blob-storage/Storage";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";
import HmacSha256 "crypto/HmacSha256";
import Hex "crypto/Hex";
import JsonExtract "crypto/JsonExtract";

persistent actor {
  // Non-transient fields survive `dfx deploy` / wasm upgrades (orthogonal persistence).
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  private var nextCapsuleId = 0;

  public type CapsuleId = Nat;
  public type Capsule = {
    id : CapsuleId;
    publicId : Text;
    creator : Principal;
    title : Text;
    encryptedMessage : Text;
    fileRefs : [Storage.ExternalBlob];
    unlockDate : Time.Time;
    createdDate : Time.Time;
    planTier : PlanTier;
    /// When true, attachment blobs are AES-GCM ciphertext (same symmetric key as `encryptedMessage`); legacy uses false.
    attachmentsEncrypted : Bool;
  };

  public type CapsuleMetadata = {
    id : Text;
    creator : Principal;
    title : Text;
    unlockDate : Time.Time;
    createdDate : Time.Time;
    isUnlocked : Bool;
    /// False while the creator is still editing (Save draft); recipients should wait until true.
    contentLocked : Bool;
    planTier : PlanTier;
    attachmentsEncrypted : Bool;
  };

  public type PlanTier = {
    #free;
    #signature;
    #legacy;
  };

  public type PaymentMethod = {
    #card;
    #crypto;
    #voucher;
  };

  public type PaymentProvider = {
    #stripe;
    #coinbase;
    #voucher;
  };

  public type PaymentStatus = {
    #pending;
    #confirmed;
    #failed;
    #expired;
    #refunded;
  };

  public type PlanQuote = {
    tier : PlanTier;
    name : Text;
    amountUsdCents : Nat;
    currency : Text;
    includedCanisters : Nat;
  };

  public type PaymentIntent = {
    id : Text;
    creator : Principal;
    tier : PlanTier;
    paymentMethod : PaymentMethod;
    provider : PaymentProvider;
    providerPaymentId : Text;
    checkoutUrl : Text;
    amountUsdCents : Nat;
    currency : Text;
    status : PaymentStatus;
    createdAt : Time.Time;
    updatedAt : Time.Time;
    expiresAt : Time.Time;
    confirmedAt : ?Time.Time;
    usedByCapsuleId : ?CapsuleId;
    ownerEmail : ?Text;
  };

  public type PaymentIntentStatus = {
    id : Text;
    tier : PlanTier;
    paymentMethod : PaymentMethod;
    provider : PaymentProvider;
    amountUsdCents : Nat;
    currency : Text;
    status : PaymentStatus;
    expiresAt : Time.Time;
    confirmedAt : ?Time.Time;
    usedByCapsuleId : ?CapsuleId;
    checkoutUrl : Text;
    ownerEmail : ?Text;
  };

  public type UserProfile = {
    name : Text;
  };

  public type ReminderTarget = {
    #owner;
    #other;
  };

  public type NotificationPreferences = {
    ownerEmail : Text;
    recipientEmail : ?Text;
    reminderTarget : ReminderTarget;
    reminderOptIn : Bool;
    marketingOptIn : Bool;
    notifyRecipientOnCreation : Bool;
    hasRecipientPermission : Bool;
    reminderConsentAt : ?Time.Time;
    marketingConsentAt : ?Time.Time;
    creationNoticeSentAt : ?Time.Time;
    unlockReminderSentAt : ?Time.Time;
    expiryReminderSentAt : ?Time.Time;
    updatedAt : Time.Time;
  };

  public type StoredFile = {
    id : Text;
    name : Text;
    mimeType : Text;
    data : Blob;
    sizeBytes : Nat;
    uploadedBy : Principal;
    uploadedAt : Time.Time;
  };

  public type PlanLimits = {
    maxMessageChars : ?Nat;
    maxFilesPerCapsule : Nat;
    maxFileBytes : Nat;
    maxTotalAttachmentBytes : Nat;
    maxUnlockHorizonNs : Int;
    retentionAfterUnlockNs : ?Int;
  };

  public type VoucherCampaign = {
    id : Text;
    tier : PlanTier;
    active : Bool;
    expiresAt : ?Time.Time;
    issuedCount : Nat;
    redeemedCount : Nat;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type VoucherCodeRecord = {
    id : Text;
    campaignId : Text;
    tier : PlanTier;
    codeFingerprint : Text;
    claimedBy : ?Principal;
    redeemedAt : ?Time.Time;
    redeemedByIntentId : ?Text;
    expiresAt : ?Time.Time;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type ProfitabilitySnapshot = {
    totalCapsules : Nat;
    freeCapsules : Nat;
    signatureCapsules : Nat;
    legacyCapsules : Nat;
    activeSignatureCapsules : Nat;
    expiredSignatureCapsules : Nat;
    totalStoredFiles : Nat;
    totalStoredFileBytes : Nat;
    signatureStoredFileBytes : Nat;
    legacyStoredFileBytes : Nat;
  };

  module Capsule {
    public func compare(c1 : Capsule, c2 : Capsule) : Order.Order {
      Nat.compare(c1.id, c2.id);
    };
  };

  module CapsuleMetadata {
    public func compare(c1 : CapsuleMetadata, c2 : CapsuleMetadata) : Order.Order {
      Text.compare(c1.id, c2.id);
    };
  };

  // Capsule data path (must stay non-transient): capsule rows, public-id index,
  // ID counter, per-capsule notification prefs, and `storedFiles` for attachments
  // kept in this canister all survive wasm upgrades. External subnet blob hashes in
  // `Capsule.fileRefs` are persisted here; the blobs themselves live on the IC
  // storage layer and must remain "live" there for those bytes to resolve.
  let capsules = Map.empty<CapsuleId, Capsule>();
  /// Capsule ids still in draft (save-as-draft); absent entries are finalized content.
  let draftCapsules = Map.empty<CapsuleId, Bool>();
  let capsuleIdsByPublicId = Map.empty<Text, CapsuleId>();
  let userProfiles = Map.empty<Principal, UserProfile>();
  let paymentIntents = Map.empty<Text, PaymentIntent>();
  let storedFiles = Map.empty<Text, StoredFile>();
  let paymentNotificationPrefs = Map.empty<Text, NotificationPreferences>();
  let capsuleNotificationPrefs = Map.empty<CapsuleId, NotificationPreferences>();
  let voucherCampaigns = Map.empty<Text, VoucherCampaign>();
  let voucherCodeByFingerprint = Map.empty<Text, VoucherCodeRecord>();

  private var nextPaymentIntentId : Nat = 0;
  private var nextStoredFileId : Nat = 0;
  private var nextVoucherCodeId : Nat = 0;
  // Persisted across upgrades so the webhook secret survives `dfx deploy`.
  // The Stripe webhook handler in this canister verifies inbound webhook
  // signatures against `stripeWebhookSecret`; admin sets it via
  // `configurePaymentWebhookSecrets`.
  private var stripeWebhookSecret : ?Text = null;
  private var coinbaseWebhookSecret : ?Text = null;
  private var localDevAdminBypassEnabled : Bool = false;
  // Idempotency table for inbound Stripe webhooks. Stripe retries on non-2xx
  // for up to 3 days, so we record every event.id we have already applied
  // and short-circuit duplicates with a 200.
  private var processedStripeEventIds = Set.empty<Text>();
  private transient var testNowOverrideNs : ?Int = null;

  private func effectiveNow() : Time.Time {
    switch (testNowOverrideNs) {
      case (null) { Time.now() };
      case (?override_) { override_ };
    };
  };

  private let FREE_INCLUDED_CANISTERS : Nat = 1;
  private let FREE_MAX_MESSAGE_CHARS : Nat = 200;
  private let PAYMENT_INTENT_TTL_NS : Int = 15 * 60 * 1_000_000_000;
  private let DAY_NS : Int = 24 * 60 * 60 * 1_000_000_000;
  private let YEAR_NS : Int = 365 * DAY_NS;
  private let FREE_MAX_UNLOCK_HORIZON_NS : Int = 1 * YEAR_NS;
  private let SIGNATURE_MAX_UNLOCK_HORIZON_NS : Int = 5 * YEAR_NS;
  private let LEGACY_MAX_UNLOCK_HORIZON_NS : Int = 50 * YEAR_NS;
  private let SIGNATURE_RETENTION_AFTER_UNLOCK_NS : Int = 30 * DAY_NS;
  private let FREE_MAX_FILES_PER_CAPSULE : Nat = 0;
  private let FREE_MAX_FILE_BYTES : Nat = 0;
  private let FREE_MAX_TOTAL_ATTACHMENT_BYTES : Nat = 0;
  private let SIGNATURE_MAX_FILES_PER_CAPSULE : Nat = 5;
  private let SIGNATURE_MAX_FILE_BYTES : Nat = 5 * 1024 * 1024;
  private let SIGNATURE_MAX_TOTAL_ATTACHMENT_BYTES : Nat = 25 * 1024 * 1024;
  private let LEGACY_MAX_FILES_PER_CAPSULE : Nat = 10;
  private let LEGACY_MAX_FILE_BYTES : Nat = 10 * 1024 * 1024;
  private let LEGACY_MAX_TOTAL_ATTACHMENT_BYTES : Nat = 100 * 1024 * 1024;
  private let ABSOLUTE_MAX_UPLOAD_FILE_BYTES : Nat = LEGACY_MAX_FILE_BYTES;
  private let DEFAULT_VOUCHER_EXPIRE_AFTER_NS : Int = 30 * DAY_NS;

  private func planQuote(plan : PlanTier) : PlanQuote {
    switch (plan) {
      case (#free) {
        {
          tier = #free;
          name = "Essential";
          amountUsdCents = 0;
          currency = "USD";
          includedCanisters = FREE_INCLUDED_CANISTERS;
        };
      };
      case (#signature) {
        {
          tier = #signature;
          name = "Signature";
          amountUsdCents = 1200;
          currency = "USD";
          includedCanisters = 1;
        };
      };
      case (#legacy) {
        {
          tier = #legacy;
          name = "Legacy";
          amountUsdCents = 3900;
          currency = "USD";
          includedCanisters = 1;
        };
      };
    };
  };

  private func planFromIntent(intent : PaymentIntent) : PlanTier {
    intent.tier;
  };

  private func planLimits(plan : PlanTier) : PlanLimits {
    switch (plan) {
      case (#free) {
        {
          maxMessageChars = ?FREE_MAX_MESSAGE_CHARS;
          maxFilesPerCapsule = FREE_MAX_FILES_PER_CAPSULE;
          maxFileBytes = FREE_MAX_FILE_BYTES;
          maxTotalAttachmentBytes = FREE_MAX_TOTAL_ATTACHMENT_BYTES;
          maxUnlockHorizonNs = FREE_MAX_UNLOCK_HORIZON_NS;
          retentionAfterUnlockNs = null;
        };
      };
      case (#signature) {
        {
          maxMessageChars = null;
          maxFilesPerCapsule = SIGNATURE_MAX_FILES_PER_CAPSULE;
          maxFileBytes = SIGNATURE_MAX_FILE_BYTES;
          maxTotalAttachmentBytes = SIGNATURE_MAX_TOTAL_ATTACHMENT_BYTES;
          maxUnlockHorizonNs = SIGNATURE_MAX_UNLOCK_HORIZON_NS;
          retentionAfterUnlockNs = ?SIGNATURE_RETENTION_AFTER_UNLOCK_NS;
        };
      };
      case (#legacy) {
        {
          maxMessageChars = null;
          maxFilesPerCapsule = LEGACY_MAX_FILES_PER_CAPSULE;
          maxFileBytes = LEGACY_MAX_FILE_BYTES;
          maxTotalAttachmentBytes = LEGACY_MAX_TOTAL_ATTACHMENT_BYTES;
          maxUnlockHorizonNs = LEGACY_MAX_UNLOCK_HORIZON_NS;
          retentionAfterUnlockNs = null;
        };
      };
    };
  };

  private func isSignatureRetentionExpired(capsule : Capsule, now : Time.Time) : Bool {
    if (capsule.planTier != #signature) {
      return false;
    };
    now > (capsule.unlockDate + SIGNATURE_RETENTION_AFTER_UNLOCK_NS);
  };

  private func nextIntentId(caller : Principal) : Text {
    let id = "pi-" # Nat.toText(nextPaymentIntentId) # "-" # Int.toText(Time.now()) # "-" # caller.toText();
    nextPaymentIntentId += 1;
    id;
  };

  private func nextStoredFileKey(caller : Principal) : Text {
    let id = "file-" # Nat.toText(nextStoredFileId) # "-" # Int.toText(Time.now()) # "-" # caller.toText();
    nextStoredFileId += 1;
    id;
  };

  private func nextVoucherCodeIdText(campaignId : Text) : Text {
    let id = "voucher-" # campaignId # "-" # Nat.toText(nextVoucherCodeId) # "-" # Int.toText(Time.now());
    nextVoucherCodeId += 1;
    id;
  };

  private func normalizeVoucherCode(code : Text) : Text {
    code;
  };

  private func normalizeCampaignId(campaignId : Text) : Text {
    campaignId;
  };

  private func voucherCodeFingerprint(code : Text) : Text {
    let normalized = normalizeVoucherCode(code);
    normalized;
  };

  private func inferCampaignPrefixFromCode(code : Text) : Text {
    let normalized = normalizeVoucherCode(code);
    let parts = Text.split(normalized, #char '-');
    switch (parts.next()) {
      case (null) { Runtime.trap("Invalid voucher code format"); };
      case (?prefix) {
        if (prefix.size() == 0) {
          Runtime.trap("Invalid voucher campaign prefix");
        };
        prefix;
      };
    };
  };

  private func campaignDefaultExpiry(now : Time.Time, campaignExpiry : ?Time.Time) : ?Time.Time {
    switch (campaignExpiry) {
      case (?custom) { ?custom };
      case (null) { ?(now + DEFAULT_VOUCHER_EXPIRE_AFTER_NS) };
    };
  };

  private func decodeFileRef(fileRef : Storage.ExternalBlob) : Text {
    switch (Text.decodeUtf8(fileRef)) {
      case (null) { Runtime.trap("Invalid file reference payload"); };
      case (?decoded) { decoded };
    };
  };

  private func capsuleContainsFileId(capsule : Capsule, fileId : Text) : Bool {
    var found = false;
    for (fileRef in capsule.fileRefs.vals()) {
      if (decodeFileRef(fileRef) == fileId) {
        found := true;
      };
    };
    found;
  };

  private func appendFileRefs(
    prefix : [Storage.ExternalBlob],
    suffix : [Storage.ExternalBlob],
  ) : [Storage.ExternalBlob] {
    let n = prefix.size();
    let m = suffix.size();
    Array.tabulate<Storage.ExternalBlob>(
      n + m,
      func(i : Nat) {
        if (i < n) {
          prefix[i];
        } else {
          suffix[i - n];
        };
      },
    );
  };

  private func validateCapsuleAttachments(
    caller : Principal,
    planTier : PlanTier,
    fileRefs : [Storage.ExternalBlob],
  ) {
    let limits = planLimits(planTier);
    if (fileRefs.size() > limits.maxFilesPerCapsule) {
      if (planTier == #free) {
        Runtime.trap("Free plan does not include file uploads.");
      };
      Runtime.trap("Too many files for one capsule.");
    };
    if (planTier != #free) {
      var totalAttachmentBytes : Nat = 0;
      for (fileRef in fileRefs.vals()) {
        let fileId = decodeFileRef(fileRef);
        let stored = switch (storedFiles.get(fileId)) {
          case (null) { Runtime.trap("Referenced file not found"); };
          case (?file) { file };
        };

        if (stored.uploadedBy != caller) {
          Runtime.trap("File ownership mismatch");
        };
        if (stored.sizeBytes > limits.maxFileBytes) {
          Runtime.trap("One or more files exceeds the per-file size limit for this plan.");
        };

        totalAttachmentBytes += stored.sizeBytes;
      };

      if (totalAttachmentBytes > limits.maxTotalAttachmentBytes) {
        Runtime.trap("Total attachment size exceeds capsule limit.");
      };
    };
  };

  /// True after finalize (or legacy capsules); false while save-as-draft editing.
  private func capsuleContentIsLocked(capsuleId : CapsuleId) : Bool {
    switch (draftCapsules.get(capsuleId)) {
      case (?_) { false };
      case (null) { true };
    };
  };

  private func providerCheckoutBase(provider : PaymentProvider) : Text {
    switch (provider) {
      case (#stripe) { "https://checkout.timecanister.app/stripe" };
      case (#coinbase) { "https://checkout.timecanister.app/coinbase" };
      case (#voucher) { "https://checkout.timecanister.app/voucher" };
    };
  };

  private func isExpired(intent : PaymentIntent) : Bool {
    effectiveNow() > intent.expiresAt;
  };

  private func countFreeCanistersFor(caller : Principal) : Nat {
    var count = 0;
    for (capsule in capsules.values()) {
      if (capsule.creator == caller and capsule.planTier == #free) {
        count += 1;
      };
    };
    count;
  };

  private func ensureUserCanCreateFree(caller : Principal) {
    if (countFreeCanistersFor(caller) >= FREE_INCLUDED_CANISTERS) {
      Runtime.trap("Free plan already used. Select a paid plan to create another canister.");
    };
  };

  private func toStatus(intent : PaymentIntent) : PaymentIntentStatus {
    {
      id = intent.id;
      tier = intent.tier;
      paymentMethod = intent.paymentMethod;
      provider = intent.provider;
      amountUsdCents = intent.amountUsdCents;
      currency = intent.currency;
      status = intent.status;
      expiresAt = intent.expiresAt;
      confirmedAt = intent.confirmedAt;
      usedByCapsuleId = intent.usedByCapsuleId;
      checkoutUrl = intent.checkoutUrl;
      ownerEmail = intent.ownerEmail;
    };
  };

  private func hasAtSymbol(email : Text) : Bool {
    var hasAt = false;
    for (char in email.chars()) {
      if (char == '@') {
        hasAt := true;
      };
    };
    hasAt;
  };

  private func validateEmailOrTrap(email : Text) {
    if (email.size() < 5 or not hasAtSymbol(email)) {
      Runtime.trap("Invalid email format");
    };
  };

  /// Validates owner/recipient emails and reminder-target rules; returns normalized emails.
  private func validateAndNormalizeNotificationEmails(
    ownerEmail : Text,
    reminderTarget : ReminderTarget,
    recipientEmail : ?Text,
    hasRecipientPermission : Bool,
  ) : (Text, ?Text) {
    validateEmailOrTrap(ownerEmail);
    let normalizedOwnerEmail = ownerEmail.toLower();

    let normalizedRecipientEmail : ?Text = switch (recipientEmail) {
      case (null) { null };
      case (?rawRecipient) {
        let cleaned = rawRecipient.toLower();
        validateEmailOrTrap(cleaned);
        ?cleaned;
      };
    };

    switch (reminderTarget) {
      case (#owner) {
        if (recipientEmail != null) {
          Runtime.trap("Recipient email must be empty when reminders target owner");
        };
      };
      case (#other) {
        if (normalizedRecipientEmail == null) {
          Runtime.trap("Recipient email is required when reminders target someone else");
        };
        if (not hasRecipientPermission) {
          Runtime.trap("Recipient permission confirmation is required");
        };
      };
    };
    (normalizedOwnerEmail, normalizedRecipientEmail);
  };

  private func mergeNotificationPreferenceRecord(
    existing : ?NotificationPreferences,
    normalizedOwnerEmail : Text,
    normalizedRecipientEmail : ?Text,
    reminderTarget : ReminderTarget,
    reminderOptIn : Bool,
    marketingOptIn : Bool,
    notifyRecipientOnCreation : Bool,
    hasRecipientPermission : Bool,
  ) : NotificationPreferences {
    let now = Time.now();
    let previousReminderOptIn = switch (existing) {
      case (null) { false };
      case (?prefs) { prefs.reminderOptIn };
    };
    let previousMarketingOptIn = switch (existing) {
      case (null) { false };
      case (?prefs) { prefs.marketingOptIn };
    };

    let reminderConsentAt = switch (existing) {
      case (?prefs) {
        if (reminderOptIn and not previousReminderOptIn) ?now else prefs.reminderConsentAt;
      };
      case (null) {
        if (reminderOptIn) ?now else null;
      };
    };
    let marketingConsentAt = switch (existing) {
      case (?prefs) {
        if (marketingOptIn and not previousMarketingOptIn) ?now else prefs.marketingConsentAt;
      };
      case (null) {
        if (marketingOptIn) ?now else null;
      };
    };
    let previousCreationNoticeSentAt = switch (existing) {
      case (null) { null };
      case (?prefs) { prefs.creationNoticeSentAt };
    };

    {
      ownerEmail = normalizedOwnerEmail;
      recipientEmail = normalizedRecipientEmail;
      reminderTarget;
      reminderOptIn;
      marketingOptIn;
      notifyRecipientOnCreation;
      hasRecipientPermission;
      reminderConsentAt;
      marketingConsentAt;
      creationNoticeSentAt = previousCreationNoticeSentAt;
      unlockReminderSentAt = switch (existing) {
        case (?prefs) { prefs.unlockReminderSentAt };
        case (null) { null };
      };
      expiryReminderSentAt = switch (existing) {
        case (?prefs) { prefs.expiryReminderSentAt };
        case (null) { null };
      };
      updatedAt = now;
    };
  };

  private func isLocalDevAdminBypassEnabled(caller : Principal) : Bool {
    // Guard bypass behind an explicit runtime flag and restrict it to the
    // local-style anonymous caller path used by the frontend in dev mode.
    localDevAdminBypassEnabled and caller.isAnonymous();
  };

  private func isAuthorizedAdmin(caller : Principal) : Bool {
    AccessControl.isAdmin(accessControlState, caller) or isLocalDevAdminBypassEnabled(caller);
  };

  // User profile management functions
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };

  public shared ({ caller }) func savePaymentNotificationPreferences(
    intentId : Text,
    ownerEmail : Text,
    reminderTarget : ReminderTarget,
    recipientEmail : ?Text,
    reminderOptIn : Bool,
    marketingOptIn : Bool,
    notifyRecipientOnCreation : Bool,
    hasRecipientPermission : Bool,
  ) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let intent = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?pi) { pi };
    };
    if (intent.creator != caller) {
      Runtime.trap("Payment intent does not belong to caller");
    };

    let (normalizedOwnerEmail, normalizedRecipientEmail) = validateAndNormalizeNotificationEmails(
      ownerEmail,
      reminderTarget,
      recipientEmail,
      hasRecipientPermission,
    );
    let existing = paymentNotificationPrefs.get(intentId);
    let record = mergeNotificationPreferenceRecord(
      existing,
      normalizedOwnerEmail,
      normalizedRecipientEmail,
      reminderTarget,
      reminderOptIn,
      marketingOptIn,
      notifyRecipientOnCreation,
      hasRecipientPermission,
    );
    paymentNotificationPrefs.add(intentId, record);
  };

  public shared ({ caller }) func saveCapsuleNotificationPreferences(
    publicId : Text,
    ownerEmail : Text,
    reminderTarget : ReminderTarget,
    recipientEmail : ?Text,
    reminderOptIn : Bool,
    marketingOptIn : Bool,
    notifyRecipientOnCreation : Bool,
    hasRecipientPermission : Bool,
  ) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let capsuleId = switch (capsuleIdsByPublicId.get(publicId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    let capsule = switch (capsules.get(capsuleId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    if (capsule.creator != caller) {
      Runtime.trap("Only the creator can update notification preferences for this capsule");
    };

    let (normalizedOwnerEmail, normalizedRecipientEmail) = validateAndNormalizeNotificationEmails(
      ownerEmail,
      reminderTarget,
      recipientEmail,
      hasRecipientPermission,
    );
    let existing = capsuleNotificationPrefs.get(capsule.id);
    let record = mergeNotificationPreferenceRecord(
      existing,
      normalizedOwnerEmail,
      normalizedRecipientEmail,
      reminderTarget,
      reminderOptIn,
      marketingOptIn,
      notifyRecipientOnCreation,
      hasRecipientPermission,
    );
    capsuleNotificationPrefs.add(capsule.id, record);
  };

  public shared ({ caller }) func getPaymentNotificationPreferences(
    intentId : Text
  ) : async ?NotificationPreferences {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let intent = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?pi) { pi };
    };
    if (intent.creator != caller) {
      Runtime.trap("Payment intent does not belong to caller");
    };
    paymentNotificationPrefs.get(intentId);
  };

  // Time capsule functions
  public shared ({ caller }) func createCapsule(
    publicId : Text,
    title : Text,
    encryptedMessage : Text,
    fileRefs : [Storage.ExternalBlob],
    unlockDate : Time.Time,
    messageCharCount : Nat,
    paymentIntentId : ?Text,
    saveAsDraft : Bool,
  ) : async CapsuleId {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can create capsules");
    };

    if (publicId.size() == 0) {
      Runtime.trap("Public canister id cannot be empty");
    };
    if (publicId.size() < 16) {
      Runtime.trap("Public canister id must be at least 16 characters");
    };
    switch (capsuleIdsByPublicId.get(publicId)) {
      case (?_) { Runtime.trap("Public canister id already exists"); };
      case (null) {};
    };

    if (title.size() == 0) {
      Runtime.trap("Capsule title cannot be empty");
    };

    if (encryptedMessage.size() == 0) {
      Runtime.trap("Encrypted message cannot be empty");
    };

    if (unlockDate <= effectiveNow()) {
      Runtime.trap("Unlock date must be in the future");
    };

    let planTier : PlanTier = switch (paymentIntentId) {
      case (null) {
        ensureUserCanCreateFree(caller);
        #free;
      };
      case (?intentId) {
        let intent = switch (paymentIntents.get(intentId)) {
          case (null) { Runtime.trap("Payment intent not found"); };
          case (?pi) { pi };
        };
        if (intent.creator != caller) {
          Runtime.trap("Payment intent does not belong to caller");
        };
        if (isExpired(intent)) {
          Runtime.trap("Payment intent expired");
        };
        if (intent.status != #confirmed) {
          Runtime.trap("Payment has not been confirmed");
        };
        switch (intent.usedByCapsuleId) {
          case (?_) { Runtime.trap("Payment intent already consumed"); };
          case (null) {};
        };
        if (intent.tier == #free) {
          Runtime.trap("Free tier does not require payment intent");
        };
        planFromIntent(intent);
      };
    };

    if (saveAsDraft and planTier == #free) {
      Runtime.trap("Save draft is only available on paid plans.");
    };

    let limits = planLimits(planTier);
    let now = effectiveNow();
    if (unlockDate > now + limits.maxUnlockHorizonNs) {
      Runtime.trap("Selected plan does not support that unlock horizon.");
    };

    switch (limits.maxMessageChars) {
      case (null) {};
      case (?maxChars) {
        if (messageCharCount > maxChars) {
          Runtime.trap("Message exceeds maximum size for selected plan.");
        };
      };
    };

    validateCapsuleAttachments(caller, planTier, fileRefs);

    let id = nextCapsuleId;
    let attachmentsEncrypted = fileRefs.size() > 0;
    let capsule = {
      id;
      publicId;
      creator = caller;
      title;
      encryptedMessage;
      fileRefs;
      unlockDate;
      createdDate = Time.now();
      planTier;
      attachmentsEncrypted;
    };
    capsules.add(id, capsule);
    capsuleIdsByPublicId.add(publicId, id);

    switch (paymentIntentId) {
      case (null) {};
      case (?intentId) {
        let intent = switch (paymentIntents.get(intentId)) {
          case (null) { Runtime.trap("Payment intent not found"); };
          case (?pi) { pi };
        };
        paymentIntents.add(
          intentId,
          {
            intent with
            usedByCapsuleId = ?id;
            updatedAt = Time.now();
          },
        );
        switch (paymentNotificationPrefs.get(intentId)) {
          case (null) {};
          case (?prefs) {
            capsuleNotificationPrefs.add(id, prefs);
          };
        };
      };
    };

    if (saveAsDraft) {
      draftCapsules.add(id, true);
    };

    nextCapsuleId += 1;
    id;
  };

  private func getCapsuleByPublicId(publicId : Text) : Capsule {
    let capsuleId = switch (capsuleIdsByPublicId.get(publicId)) {
      case (null) { Runtime.trap("Capsule not found") };
      case (?value) { value };
    };
    switch (capsules.get(capsuleId)) {
      case (null) { Runtime.trap("Capsule not found") };
      case (?capsule) { capsule };
    };
  };

  public shared ({ caller }) func uploadCapsuleFile(
    name : Text,
    mimeType : Text,
    data : Blob,
  ) : async Text {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can upload files");
    };

    if (name.size() == 0) {
      Runtime.trap("File name cannot be empty");
    };

    let fileSize = data.size();
    if (fileSize == 0) {
      Runtime.trap("File cannot be empty");
    };
    if (fileSize > ABSOLUTE_MAX_UPLOAD_FILE_BYTES) {
      Runtime.trap("File exceeds max allowed size");
    };

    let fileId = nextStoredFileKey(caller);
    storedFiles.add(
      fileId,
      {
        id = fileId;
        name;
        mimeType;
        data;
        sizeBytes = fileSize;
        uploadedBy = caller;
        uploadedAt = Time.now();
      },
    );
    fileId;
  };

  public shared ({ caller }) func appendCapsuleFiles(
    publicId : Text,
    newFileRefs : [Storage.ExternalBlob],
    filesEncrypted : Bool,
  ) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can update capsules");
    };
    let capsuleId = switch (capsuleIdsByPublicId.get(publicId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    let capsule = switch (capsules.get(capsuleId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    if (capsule.creator != caller) {
      Runtime.trap("Only the creator can add files to this capsule");
    };
    switch (draftCapsules.get(capsuleId)) {
      case (?_) {};
      case (null) { Runtime.trap("Capsule content is already finalized."); };
    };
    if (capsule.planTier == #free) {
      Runtime.trap("Draft attachments are only available on paid plans.");
    };
    let merged = appendFileRefs(capsule.fileRefs, newFileRefs);
    validateCapsuleAttachments(caller, capsule.planTier, merged);
    let attachmentsEncrypted = if (newFileRefs.size() == 0) {
      capsule.attachmentsEncrypted;
    } else if (capsule.attachmentsEncrypted and not filesEncrypted) {
      Runtime.trap("This canister uses encrypted attachments; upload ciphertext only.");
    } else if (filesEncrypted) {
      true;
    } else {
      capsule.attachmentsEncrypted;
    };
    capsules.add(
      capsuleId,
      { capsule with fileRefs = merged; attachmentsEncrypted },
    );
  };

  public shared ({ caller }) func lockCapsule(publicId : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can finalize capsules");
    };
    let capsuleId = switch (capsuleIdsByPublicId.get(publicId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    let capsule = switch (capsules.get(capsuleId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    if (capsule.creator != caller) {
      Runtime.trap("Only the creator can finalize this capsule");
    };
    switch (draftCapsules.get(capsuleId)) {
      case (?_) {};
      case (null) { Runtime.trap("Capsule is already finalized."); };
    };
    draftCapsules.remove(capsuleId);
  };

  public query ({ caller = _ }) func getCapsuleMetadata(id : Text) : async CapsuleMetadata {
    let capsule = getCapsuleByPublicId(id);

    {
      id = capsule.publicId;
      creator = capsule.creator;
      title = capsule.title;
      unlockDate = capsule.unlockDate;
      createdDate = capsule.createdDate;
      isUnlocked = effectiveNow() >= capsule.unlockDate;
      contentLocked = capsuleContentIsLocked(capsule.id);
      planTier = capsule.planTier;
      attachmentsEncrypted = capsule.attachmentsEncrypted;
    };
  };

  public query ({ caller = _ }) func getCapsuleContent(id : Text) : async {
    encryptedMessage : Text;
    fileRefs : [Storage.ExternalBlob];
  } {
    let capsule = getCapsuleByPublicId(id);

    if (not capsuleContentIsLocked(capsule.id)) {
      Runtime.trap("Capsule content has not been finalized by the creator yet.");
    };
    if (effectiveNow() < capsule.unlockDate) {
      Runtime.trap("Capsule is still locked until " # Int.toText(capsule.unlockDate));
    };
    if (isSignatureRetentionExpired(capsule, effectiveNow())) {
      Runtime.trap("Signature retention window expired. Capsule content is no longer available.");
    };

    {
      encryptedMessage = capsule.encryptedMessage;
      fileRefs = capsule.fileRefs;
    };
  };

  public query ({ caller = _ }) func getCapsuleFile(capsuleId : Text, fileId : Text) : async {
    name : Text;
    mimeType : Text;
    data : Blob;
  } {
    let capsule = getCapsuleByPublicId(capsuleId);

    if (not capsuleContentIsLocked(capsule.id)) {
      Runtime.trap("Capsule content has not been finalized by the creator yet.");
    };
    if (effectiveNow() < capsule.unlockDate) {
      Runtime.trap("Capsule is still locked");
    };
    if (isSignatureRetentionExpired(capsule, effectiveNow())) {
      Runtime.trap("Signature retention window expired. Files are no longer available.");
    };

    if (not capsuleContainsFileId(capsule, fileId)) {
      Runtime.trap("File does not belong to this capsule");
    };

    let file = switch (storedFiles.get(fileId)) {
      case (null) { Runtime.trap("File not found"); };
      case (?value) { value };
    };

    {
      name = file.name;
      mimeType = file.mimeType;
      data = file.data;
    };
  };

  public query ({ caller }) func getMyCapsules() : async [CapsuleMetadata] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view their capsules");
    };

    capsules.values().toArray().filter(
      func(c) {
        c.creator == caller;
      }
    ).map(
      func(c) {
        {
          id = c.publicId;
          creator = c.creator;
          title = c.title;
          unlockDate = c.unlockDate;
          createdDate = c.createdDate;
          isUnlocked = effectiveNow() >= c.unlockDate;
          contentLocked = capsuleContentIsLocked(c.id);
          planTier = c.planTier;
          attachmentsEncrypted = c.attachmentsEncrypted;
        };
      }
    ).sort();
  };

  // Creator-only: removes capsule rows and attachment blobs from stable storage.
  // Payment intents keep usedByCapsuleId so a consumed paid slot cannot be reused after delete.
  public shared ({ caller }) func deleteCapsule(publicId : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let capsuleId = switch (capsuleIdsByPublicId.get(publicId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    let capsule = switch (capsules.get(capsuleId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    if (capsule.creator != caller) {
      Runtime.trap("Only the creator can delete this capsule");
    };

    for (fileRef in capsule.fileRefs.vals()) {
      let fileId = decodeFileRef(fileRef);
      storedFiles.remove(fileId);
    };
    capsuleNotificationPrefs.remove(capsule.id);
    draftCapsules.remove(capsuleId);
    capsules.remove(capsuleId);
    capsuleIdsByPublicId.remove(publicId);
  };

  public shared ({ caller }) func updateCapsuleTitle(publicId : Text, newTitle : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    if (newTitle.size() == 0) {
      Runtime.trap("Capsule title cannot be empty");
    };
    let capsuleId = switch (capsuleIdsByPublicId.get(publicId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    let capsule = switch (capsules.get(capsuleId)) {
      case (null) { Runtime.trap("Capsule not found"); };
      case (?value) { value };
    };
    if (capsule.creator != caller) {
      Runtime.trap("Only the creator can rename this capsule");
    };
    capsules.add(capsuleId, { capsule with title = newTitle });
  };

  public query ({ caller = _ }) func getTotalCapsuleCount() : async Nat {
    capsules.size();
  };

  public query ({ caller }) func getPricingPlans() : async [PlanQuote] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    [planQuote(#free), planQuote(#signature), planQuote(#legacy)];
  };

  public query ({ caller }) func getProfitabilitySnapshot() : async ProfitabilitySnapshot {
    if (not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    let now = effectiveNow();
    var totalCapsules : Nat = 0;
    var freeCapsules : Nat = 0;
    var signatureCapsules : Nat = 0;
    var legacyCapsules : Nat = 0;
    var activeSignatureCapsules : Nat = 0;
    var expiredSignatureCapsules : Nat = 0;
    var signatureStoredFileBytes : Nat = 0;
    var legacyStoredFileBytes : Nat = 0;

    for (capsule in capsules.values()) {
      totalCapsules += 1;
      switch (capsule.planTier) {
        case (#free) {
          freeCapsules += 1;
        };
        case (#signature) {
          signatureCapsules += 1;
          if (isSignatureRetentionExpired(capsule, now)) {
            expiredSignatureCapsules += 1;
          } else {
            activeSignatureCapsules += 1;
          };
          for (fileRef in capsule.fileRefs.vals()) {
            let fileId = decodeFileRef(fileRef);
            switch (storedFiles.get(fileId)) {
              case (null) {};
              case (?stored) { signatureStoredFileBytes += stored.sizeBytes };
            };
          };
        };
        case (#legacy) {
          legacyCapsules += 1;
          for (fileRef in capsule.fileRefs.vals()) {
            let fileId = decodeFileRef(fileRef);
            switch (storedFiles.get(fileId)) {
              case (null) {};
              case (?stored) { legacyStoredFileBytes += stored.sizeBytes };
            };
          };
        };
      };
    };

    var totalStoredFiles : Nat = 0;
    var totalStoredFileBytes : Nat = 0;
    for (file in storedFiles.values()) {
      totalStoredFiles += 1;
      totalStoredFileBytes += file.sizeBytes;
    };

    {
      totalCapsules;
      freeCapsules;
      signatureCapsules;
      legacyCapsules;
      activeSignatureCapsules;
      expiredSignatureCapsules;
      totalStoredFiles;
      totalStoredFileBytes;
      signatureStoredFileBytes;
      legacyStoredFileBytes;
    };
  };

  public shared ({ caller }) func setTestNowOverride(overrideNs : ?Int) : async () {
    if (not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    testNowOverrideNs := overrideNs;
  };

  public query ({ caller = _ }) func getEffectiveNow() : async Time.Time {
    effectiveNow();
  };

  public shared ({ caller }) func purgeExpiredSignatureCapsules() : async Nat {
    if (not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    let now = effectiveNow();
    var purgedCapsuleCount : Nat = 0;
    for (capsule in capsules.values()) {
      if (capsule.planTier == #signature and isSignatureRetentionExpired(capsule, now)) {
        for (fileRef in capsule.fileRefs.vals()) {
          let fileId = decodeFileRef(fileRef);
          storedFiles.remove(fileId);
        };
        let updatedCapsule : Capsule = {
          capsule with
          fileRefs = [];
        };
        capsules.add(capsule.id, updatedCapsule);
        purgedCapsuleCount += 1;
      };
    };
    purgedCapsuleCount;
  };

  public query ({ caller }) func getCapsuleNotificationPreferences(
    publicId : Text
  ) : async ?NotificationPreferences {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let capsule = getCapsuleByPublicId(publicId);
    if (capsule.creator != caller and not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    capsuleNotificationPrefs.get(capsule.id);
  };

  public shared ({ caller }) func createPaymentIntent(
    tier : PlanTier,
    paymentMethod : PaymentMethod,
  ) : async PaymentIntentStatus {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    if (tier == #free) {
      Runtime.trap("No payment required for free plan");
    };

    if (paymentMethod == #voucher) {
      Runtime.trap("Voucher payments are not available yet");
    };

    let quote = planQuote(tier);
    let intentId = nextIntentId(caller);
    let provider : PaymentProvider = switch (paymentMethod) {
      case (#card) { #stripe };
      case (#crypto) { #coinbase };
      case (#voucher) { Runtime.trap("unreachable: voucher handled above") };
    };
    let now = Time.now();
    let providerPrefix = switch (provider) {
      case (#stripe) { "stripe"; };
      case (#coinbase) { "coinbase"; };
      case (#voucher) { "voucher"; };
    };
    let providerPaymentId = providerPrefix # "-" # intentId;
    let checkoutUrl = providerCheckoutBase(provider) # "/" # intentId;

    let intent : PaymentIntent = {
      id = intentId;
      creator = caller;
      tier;
      paymentMethod;
      provider;
      providerPaymentId;
      checkoutUrl;
      amountUsdCents = quote.amountUsdCents;
      currency = quote.currency;
      status = #pending;
      createdAt = now;
      updatedAt = now;
      expiresAt = now + PAYMENT_INTENT_TTL_NS;
      confirmedAt = null;
      usedByCapsuleId = null;
      ownerEmail = null;
    };
    paymentIntents.add(intentId, intent);
    toStatus(intent);
  };

  public shared ({ caller }) func createVoucherCampaign(
    campaignId : Text,
    tier : PlanTier,
    expiresAt : ?Time.Time,
    active : Bool,
  ) : async VoucherCampaign {
    if (not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    if (tier == #free) {
      Runtime.trap("Voucher campaigns cannot target free plan");
    };
    let normalizedCampaignId = normalizeCampaignId(campaignId);
    if (normalizedCampaignId.size() < 3) {
      Runtime.trap("Campaign id must be at least 3 characters");
    };
    switch (voucherCampaigns.get(normalizedCampaignId)) {
      case (?_) { Runtime.trap("Campaign already exists"); };
      case (null) {};
    };
    let now = Time.now();
    let campaign : VoucherCampaign = {
      id = normalizedCampaignId;
      tier;
      active;
      expiresAt = campaignDefaultExpiry(now, expiresAt);
      issuedCount = 0;
      redeemedCount = 0;
      createdAt = now;
      updatedAt = now;
    };
    voucherCampaigns.add(normalizedCampaignId, campaign);
    campaign;
  };

  public shared ({ caller }) func setVoucherCampaignActive(campaignId : Text, active : Bool) : async VoucherCampaign {
    if (not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    let normalizedCampaignId = normalizeCampaignId(campaignId);
    let campaign = switch (voucherCampaigns.get(normalizedCampaignId)) {
      case (null) { Runtime.trap("Campaign not found"); };
      case (?value) { value };
    };
    let updated = {
      campaign with
      active;
      updatedAt = Time.now();
    };
    voucherCampaigns.add(normalizedCampaignId, updated);
    updated;
  };

  public shared ({ caller }) func issueVoucherCodes(
    campaignId : Text,
    codes : [Text],
  ) : async Nat {
    if (not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    let normalizedCampaignId = normalizeCampaignId(campaignId);
    let campaign = switch (voucherCampaigns.get(normalizedCampaignId)) {
      case (null) { Runtime.trap("Campaign not found"); };
      case (?value) { value };
    };
    let expiry = campaign.expiresAt;
    var issuedNow : Nat = 0;
    for (code in codes.vals()) {
      let normalizedCode = normalizeVoucherCode(code);
      if (normalizedCode.size() < 6) {
        Runtime.trap("Voucher code too short");
      };
      if (inferCampaignPrefixFromCode(normalizedCode) != normalizedCampaignId) {
        Runtime.trap("Voucher code prefix must match campaign id");
      };
      let fingerprint = voucherCodeFingerprint(normalizedCode);
      switch (voucherCodeByFingerprint.get(fingerprint)) {
        case (?_) { Runtime.trap("Duplicate voucher code"); };
        case (null) {};
      };
      let now = Time.now();
      voucherCodeByFingerprint.add(
        fingerprint,
        {
          id = nextVoucherCodeIdText(normalizedCampaignId);
          campaignId = normalizedCampaignId;
          tier = campaign.tier;
          codeFingerprint = fingerprint;
          claimedBy = null;
          redeemedAt = null;
          redeemedByIntentId = null;
          expiresAt = expiry;
          createdAt = now;
          updatedAt = now;
        },
      );
      issuedNow += 1;
    };
    voucherCampaigns.add(
      normalizedCampaignId,
      {
        campaign with
        issuedCount = campaign.issuedCount + issuedNow;
        updatedAt = Time.now();
      },
    );
    issuedNow;
  };

  public query ({ caller }) func listVoucherCampaigns() : async [VoucherCampaign] {
    if (not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    voucherCampaigns.values().toArray().sort(func(a, b) { Text.compare(a.id, b.id) });
  };

  public shared ({ caller }) func redeemVoucherCode(
    code : Text,
    tier : PlanTier,
  ) : async PaymentIntentStatus {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    if (tier == #free) {
      Runtime.trap("Free plan does not require vouchers");
    };
    let fingerprint = voucherCodeFingerprint(code);
    let voucher = switch (voucherCodeByFingerprint.get(fingerprint)) {
      case (null) { Runtime.trap("Invalid voucher code"); };
      case (?value) { value };
    };
    let campaign = switch (voucherCampaigns.get(voucher.campaignId)) {
      case (null) { Runtime.trap("Campaign not found"); };
      case (?value) { value };
    };
    if (not campaign.active) {
      Runtime.trap("Voucher campaign is not active");
    };
    if (voucher.tier != tier) {
      Runtime.trap("Voucher does not match selected plan");
    };
    let now = Time.now();
    switch (voucher.expiresAt) {
      case (?expiry) {
        if (now > expiry) {
          Runtime.trap("Voucher expired");
        };
      };
      case (null) {};
    };
    switch (voucher.claimedBy) {
      case (?claimedBy) {
        if (claimedBy != caller) {
          Runtime.trap("Voucher already claimed by another user");
        };
      };
      case (null) {};
    };
    switch (voucher.redeemedByIntentId) {
      case (?_) { Runtime.trap("Voucher already redeemed"); };
      case (null) {};
    };

    let quote = planQuote(tier);
    let intentId = nextIntentId(caller);
    let intent : PaymentIntent = {
      id = intentId;
      creator = caller;
      tier;
      paymentMethod = #voucher;
      provider = #voucher;
      providerPaymentId = "voucher-" # voucher.id;
      checkoutUrl = providerCheckoutBase(#voucher) # "/" # intentId;
      amountUsdCents = 0;
      currency = quote.currency;
      status = #confirmed;
      createdAt = now;
      updatedAt = now;
      expiresAt = now + PAYMENT_INTENT_TTL_NS;
      confirmedAt = ?now;
      usedByCapsuleId = null;
      ownerEmail = null;
    };
    paymentIntents.add(intentId, intent);

    voucherCodeByFingerprint.add(
      fingerprint,
      {
        voucher with
        claimedBy = ?caller;
        redeemedAt = ?now;
        redeemedByIntentId = ?intentId;
        updatedAt = now;
      },
    );
    voucherCampaigns.add(
      voucher.campaignId,
      {
        campaign with
        redeemedCount = campaign.redeemedCount + 1;
        updatedAt = now;
      },
    );
    toStatus(intent);
  };

  public shared ({ caller }) func getPaymentIntentStatus(intentId : Text) : async PaymentIntentStatus {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let intent = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?pi) { pi };
    };
    if (intent.creator != caller) {
      Runtime.trap("Payment intent does not belong to caller");
    };
    if (intent.status == #pending and isExpired(intent)) {
      let updated = { intent with status = #expired; updatedAt = Time.now() };
      paymentIntents.add(intentId, updated);
      return toStatus(updated);
    };
    toStatus(intent);
  };

  public shared ({ caller }) func getPaymentIntentStatusForProvider(
    intentId : Text,
    webhookSecret : Text,
  ) : async PaymentIntentStatus {
    let expectedSecret = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?intent) {
        switch (intent.provider) {
          case (#stripe) { stripeWebhookSecret };
          case (#coinbase) { coinbaseWebhookSecret };
          case (#voucher) { null };
        };
      };
    };

    let authorized = if (isAuthorizedAdmin(caller)) {
      true;
    } else {
      switch (expectedSecret) {
        case (null) { false };
        case (?secret) { webhookSecret == secret };
      };
    };
    if (not authorized) {
      Runtime.trap("Unauthorized provider payment status lookup");
    };

    let intent = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?pi) { pi };
    };
    if (intent.status == #pending and isExpired(intent)) {
      let updated = { intent with status = #expired; updatedAt = Time.now() };
      paymentIntents.add(intentId, updated);
      return toStatus(updated);
    };
    toStatus(intent);
  };

  public shared ({ caller }) func setPaymentIntentOwnerEmailFromProvider(
    intentId : Text,
    ownerEmail : Text,
    webhookSecret : Text,
  ) : async () {
    validateEmailOrTrap(ownerEmail);
    let normalizedOwnerEmail = ownerEmail.toLower();
    let expectedSecret = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?intent) {
        switch (intent.provider) {
          case (#stripe) { stripeWebhookSecret };
          case (#coinbase) { coinbaseWebhookSecret };
          case (#voucher) { null };
        };
      };
    };

    let authorized = if (isAuthorizedAdmin(caller)) {
      true;
    } else {
      switch (expectedSecret) {
        case (null) { false };
        case (?secret) { webhookSecret == secret };
      };
    };
    if (not authorized) {
      Runtime.trap("Unauthorized provider email update");
    };

    let intent = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?pi) { pi };
    };
    paymentIntents.add(
      intentId,
      {
        intent with
        ownerEmail = ?normalizedOwnerEmail;
        updatedAt = Time.now();
      },
    );
  };

  public shared ({ caller }) func getPaymentNotificationPreferencesForProvider(
    intentId : Text,
    webhookSecret : Text,
  ) : async ?NotificationPreferences {
    let expectedSecret = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?intent) {
        switch (intent.provider) {
          case (#stripe) { stripeWebhookSecret };
          case (#coinbase) { coinbaseWebhookSecret };
          case (#voucher) { null };
        };
      };
    };

    let authorized = if (isAuthorizedAdmin(caller)) {
      true;
    } else {
      switch (expectedSecret) {
        case (null) { false };
        case (?secret) { webhookSecret == secret };
      };
    };
    if (not authorized) {
      Runtime.trap("Unauthorized provider preference lookup");
    };
    paymentNotificationPrefs.get(intentId);
  };

  public shared ({ caller }) func markCreationNoticeSentForProvider(
    intentId : Text,
    webhookSecret : Text,
  ) : async () {
    let expectedSecret = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?intent) {
        switch (intent.provider) {
          case (#stripe) { stripeWebhookSecret };
          case (#coinbase) { coinbaseWebhookSecret };
          case (#voucher) { null };
        };
      };
    };

    let authorized = if (isAuthorizedAdmin(caller)) {
      true;
    } else {
      switch (expectedSecret) {
        case (null) { false };
        case (?secret) { webhookSecret == secret };
      };
    };
    if (not authorized) {
      Runtime.trap("Unauthorized provider creation-notice update");
    };

    let existing = switch (paymentNotificationPrefs.get(intentId)) {
      case (null) { Runtime.trap("Notification preferences not found for intent"); };
      case (?prefs) { prefs };
    };
    paymentNotificationPrefs.add(
      intentId,
      {
        existing with
        creationNoticeSentAt = ?Time.now();
        updatedAt = Time.now();
      },
    );
  };

  public shared ({ caller }) func markUnlockReminderSentForProvider(
    intentId : Text,
    webhookSecret : Text,
  ) : async () {
    let expectedSecret = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?intent) {
        switch (intent.provider) {
          case (#stripe) { stripeWebhookSecret };
          case (#coinbase) { coinbaseWebhookSecret };
          case (#voucher) { null };
        };
      };
    };
    let authorized = if (isAuthorizedAdmin(caller)) {
      true;
    } else {
      switch (expectedSecret) {
        case (null) { false };
        case (?secret) { webhookSecret == secret };
      };
    };
    if (not authorized) {
      Runtime.trap("Unauthorized provider unlock-reminder update");
    };
    let existing = switch (paymentNotificationPrefs.get(intentId)) {
      case (null) { Runtime.trap("Notification preferences not found for intent"); };
      case (?prefs) { prefs };
    };
    paymentNotificationPrefs.add(
      intentId,
      {
        existing with
        unlockReminderSentAt = ?Time.now();
        updatedAt = Time.now();
      },
    );
  };

  public shared ({ caller }) func markExpiryReminderSentForProvider(
    intentId : Text,
    webhookSecret : Text,
  ) : async () {
    let expectedSecret = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?intent) {
        switch (intent.provider) {
          case (#stripe) { stripeWebhookSecret };
          case (#coinbase) { coinbaseWebhookSecret };
          case (#voucher) { null };
        };
      };
    };
    let authorized = if (isAuthorizedAdmin(caller)) {
      true;
    } else {
      switch (expectedSecret) {
        case (null) { false };
        case (?secret) { webhookSecret == secret };
      };
    };
    if (not authorized) {
      Runtime.trap("Unauthorized provider expiry-reminder update");
    };
    let existing = switch (paymentNotificationPrefs.get(intentId)) {
      case (null) { Runtime.trap("Notification preferences not found for intent"); };
      case (?prefs) { prefs };
    };
    paymentNotificationPrefs.add(
      intentId,
      {
        existing with
        expiryReminderSentAt = ?Time.now();
        updatedAt = Time.now();
      },
    );
  };

  public shared ({ caller }) func setMarketingOptInByOwnerEmailForProvider(
    ownerEmail : Text,
    marketingOptIn : Bool,
    webhookSecret : Text,
  ) : async Nat {
    validateEmailOrTrap(ownerEmail);
    let normalizedOwnerEmail = ownerEmail.toLower();
    let authorized = if (AccessControl.isAdmin(accessControlState, caller)) {
      true;
    } else {
      switch (stripeWebhookSecret) {
        case (?secret) { webhookSecret == secret };
        case (null) {
          switch (coinbaseWebhookSecret) {
            case (?coinbaseSecret) { webhookSecret == coinbaseSecret };
            case (null) { false };
          };
        };
      };
    };
    if (not authorized) {
      Runtime.trap("Unauthorized provider marketing opt update");
    };

    var updates : Nat = 0;
    for ((intentId, prefs) in paymentNotificationPrefs.entries()) {
      if (prefs.ownerEmail == normalizedOwnerEmail) {
        paymentNotificationPrefs.add(
          intentId,
          {
            prefs with
            marketingOptIn;
            updatedAt = Time.now();
          },
        );
        updates += 1;
      };
    };
    for ((capsuleId, prefs) in capsuleNotificationPrefs.entries()) {
      if (prefs.ownerEmail == normalizedOwnerEmail) {
        capsuleNotificationPrefs.add(
          capsuleId,
          {
            prefs with
            marketingOptIn;
            updatedAt = Time.now();
          },
        );
      };
    };
    updates;
  };

  public query ({ caller }) func getMyPaymentIntents() : async [PaymentIntentStatus] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    paymentIntents.values().toArray().filter(
      func(intent) {
        intent.creator == caller;
      }
    ).map(toStatus);
  };

  public shared ({ caller }) func configurePaymentWebhookSecrets(
    stripe : ?Text,
    coinbase : ?Text,
  ) : async () {
    if (not isAuthorizedAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    stripeWebhookSecret := stripe;
    coinbaseWebhookSecret := coinbase;
  };

  public shared ({ caller }) func setLocalDevAdminBypassEnabled(enabled : Bool) : async () {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized");
    };
    localDevAdminBypassEnabled := enabled;
  };

  public query ({ caller }) func getLocalDevAdminBypassEnabled() : async Bool {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized");
    };
    localDevAdminBypassEnabled;
  };

  // Self-test helper for the payments relay. Returns true iff the supplied
  // webhook secret matches the value configured for `provider`. Returns false
  // when no secret is configured or when the secret does not match. This lets
  // the relay verify on startup that admin has run `configurePaymentWebhookSecrets`
  // with the same value as `STRIPE_WEBHOOK_SECRET`, instead of waiting until a
  // real payment fails.
  public query func verifyPaymentWebhookSecret(provider : Text, candidateSecret : Text) : async Bool {
    let configured = switch (provider) {
      case ("stripe") { stripeWebhookSecret };
      case ("coinbase") { coinbaseWebhookSecret };
      case (_) { null };
    };
    switch (configured) {
      case (null) { false };
      case (?secret) { candidateSecret == secret };
    };
  };

  public shared ({ caller }) func confirmPaymentIntent(
    intentId : Text,
    providerPaymentId : Text,
    targetStatus : PaymentStatus,
    webhookSecret : Text,
  ) : async PaymentIntentStatus {
    let expectedSecret = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?intent) {
        switch (intent.provider) {
          case (#stripe) { stripeWebhookSecret };
          case (#coinbase) { coinbaseWebhookSecret };
          case (#voucher) { null };
        };
      };
    };

    let requiresSecretCheck = switch (expectedSecret) {
      case (null) { false };
      case (?_) { true };
    };

    if (requiresSecretCheck and not isAuthorizedAdmin(caller)) {
      switch (expectedSecret) {
        case (null) {};
        case (?secret) {
          if (webhookSecret != secret) {
            Runtime.trap("Unauthorized payment confirmation");
          };
        };
      };
    };

    let intent = switch (paymentIntents.get(intentId)) {
      case (null) { Runtime.trap("Payment intent not found"); };
      case (?pi) { pi };
    };

    if (intent.providerPaymentId != providerPaymentId) {
      let expectedPrefix = switch (intent.provider) {
        case (#stripe) { "stripe-" # intent.id };
        case (#coinbase) { "coinbase-" # intent.id };
        case (#voucher) { "voucher-" # intent.id };
      };
      if (intent.providerPaymentId != expectedPrefix) {
        Runtime.trap("Provider payment id mismatch");
      };
    };

    if (intent.status != #pending) {
      return toStatus(intent);
    };

    let now = Time.now();
    let nextStatus : PaymentStatus = if (isExpired(intent) and targetStatus == #pending) #expired else targetStatus;
    let confirmedAt : ?Time.Time = if (nextStatus == #confirmed) ?now else null;
    let updated = {
      intent with
      providerPaymentId = providerPaymentId;
      status = nextStatus;
      updatedAt = now;
      confirmedAt = confirmedAt;
    };
    paymentIntents.add(intentId, updated);
    toStatus(updated);
  };

  // ===========================================================================
  // IC HTTP gateway — inbound Stripe webhook handler
  // ===========================================================================
  //
  // Stripe Checkout (Payment Links) POSTs `checkout.session.completed` events
  // to `https://<canister-id>.icp0.io/payments/stripe/webhook`. We:
  //   1. Return `upgrade=true` from `http_request` so the boundary node
  //      re-issues the call as `http_request_update` (state-mutating).
  //   2. In `http_request_update`, verify HMAC-SHA256 against
  //      `stripeWebhookSecret` (5min skew window), short-circuit on duplicate
  //      `event.id`, then mark the matching payment intent as confirmed.
  //
  // Stripe expects a 2xx within ~10 seconds; update calls on the IC are well
  // under that.

  type HttpHeader = (Text, Text);

  public type HttpRequest = {
    method : Text;
    url : Text;
    headers : [HttpHeader];
    body : Blob;
    certificate_version : ?Nat16;
  };

  public type HttpResponse = {
    status_code : Nat16;
    headers : [HttpHeader];
    body : Blob;
    upgrade : ?Bool;
  };

  let STRIPE_WEBHOOK_PATH : Text = "/payments/stripe/webhook";
  let STRIPE_HEALTH_PATH : Text = "/payments/health";
  // Stripe's recommended timestamp skew tolerance for webhook signatures.
  let STRIPE_WEBHOOK_TOLERANCE_SECONDS : Int = 300;

  private func textResponse(status : Nat16, body : Text) : HttpResponse {
    {
      status_code = status;
      headers = [
        ("content-type", "text/plain; charset=utf-8"),
        ("cache-control", "no-store"),
      ];
      body = Text.encodeUtf8(body);
      upgrade = null;
    };
  };

  private func upgradeResponse() : HttpResponse {
    {
      status_code = 200;
      headers = [];
      body = Text.encodeUtf8("");
      upgrade = ?true;
    };
  };

  // Strip query string from `url` so route matching is exact.
  private func pathOnly(url : Text) : Text {
    let parts = Text.split(url, #char '?');
    switch (parts.next()) {
      case (?p) { p };
      case (null) { url };
    };
  };

  // Find a header value (case-insensitive header name).
  private func findHeader(headers : [HttpHeader], name : Text) : ?Text {
    let lcName = name.toLower();
    for ((k, v) in headers.vals()) {
      if (k.toLower() == lcName) { return ?v };
    };
    null;
  };

  // Parse `t=NNN,v1=HEX[,v1=HEX...]` from the Stripe-Signature header.
  // Returns `null` when malformed or missing required fields. Stripe may
  // include multiple `v1=` values during signing-secret rotation; we accept
  // the request if ANY of them matches the expected MAC.
  private func parseStripeSignature(header : Text) : ?{ timestamp : Text; v1Hexes : [Text] } {
    var timestamp : ?Text = null;
    var v1Hexes : [Text] = [];
    for (segment in Text.split(header, #char ',')) {
      let trimmed = trimSpaces(segment);
      let kvIter = Text.split(trimmed, #char '=');
      switch (kvIter.next(), kvIter.next()) {
        case (?k, ?v) {
          if (k == "t") { timestamp := ?v };
          if (k == "v1") { v1Hexes := Array.tabulate<Text>(v1Hexes.size() + 1, func(i) { if (i < v1Hexes.size()) { v1Hexes[i] } else { v } }) };
        };
        case _ {};
      };
    };
    switch (timestamp) {
      case (?ts) {
        if (v1Hexes.size() == 0) { null } else { ?{ timestamp = ts; v1Hexes } };
      };
      case (null) { null };
    };
  };

  private func trimSpaces(t : Text) : Text {
    let chars = Iter.toArray<Char>(t.chars());
    var start = 0;
    var endIdx : Nat = chars.size();
    while (start < endIdx and (chars[start] == ' ' or chars[start] == '\t')) {
      start += 1;
    };
    while (endIdx > start and (chars[endIdx - 1] == ' ' or chars[endIdx - 1] == '\t')) {
      endIdx -= 1;
    };
    var out = "";
    var i = start;
    while (i < endIdx) {
      out #= Text.fromChar(chars[i]);
      i += 1;
    };
    out;
  };

  private func parseNat(t : Text) : ?Nat {
    var n : Nat = 0;
    var any = false;
    for (c in t.chars()) {
      let code = Char.toNat32(c);
      if (code >= 0x30 and code <= 0x39) {
        n := n * 10 + Nat32ToNat(code - 0x30);
        any := true;
      } else {
        return null;
      };
    };
    if (any) { ?n } else { null };
  };

  private func Nat32ToNat(n : Nat32) : Nat {
    // Wrap via Nat16 + high-word multiply; avoids pulling Nat32 into the
    // top-level imports just for `toNat`.
    let lo : Nat = Nat16.toNat(Nat16.fromNat32(n & 0xffff));
    let hi : Nat = Nat16.toNat(Nat16.fromNat32((n >> 16) & 0xffff));
    hi * 0x10000 + lo;
  };

  // Verify timestamp + at least one v1 signature against the expected secret.
  // Returns true iff:
  //   - timestamp parses as a Nat (epoch seconds),
  //   - |now - timestamp| <= STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  //   - HMAC-SHA256(secret, "<t>.<rawBody>") matches one of the v1 hex digests
  //     (constant-time compare).
  private func verifyStripeWebhookSignature(
    rawBody : Blob,
    sigHeader : Text,
    secret : Text,
  ) : Bool {
    switch (parseStripeSignature(sigHeader)) {
      case (null) { false };
      case (?parsed) {
        switch (parseNat(parsed.timestamp)) {
          case (null) { false };
          case (?t) {
            let nowSec : Int = Time.now() / 1_000_000_000;
            let diff = if (nowSec >= t) { nowSec - t } else { t - nowSec };
            if (diff > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
              return false;
            };
            let signedPayload = Array.flatten<Nat8>([
              Blob.toArray(Text.encodeUtf8(parsed.timestamp)),
              Blob.toArray(Text.encodeUtf8(".")),
              Blob.toArray(rawBody),
            ]);
            let mac = HmacSha256.mac(
              Blob.toArray(Text.encodeUtf8(secret)),
              signedPayload,
            );
            var matched = false;
            for (hexSig in parsed.v1Hexes.vals()) {
              switch (Hex.decode(hexSig)) {
                case (?candidate) {
                  if (HmacSha256.equalConstantTime(mac, candidate)) {
                    matched := true;
                  };
                };
                case (null) {};
              };
            };
            matched;
          };
        };
      };
    };
  };

  // Apply a verified Stripe webhook event to local state. Returns the HTTP
  // status the canister should reply with.
  private func applyStripeWebhookEvent(bodyText : Text) : Nat16 {
    let eventId = switch (JsonExtract.findString(bodyText, "id")) {
      case (?id) { id };
      case (null) { return 400 };
    };
    if (Set.contains(processedStripeEventIds, eventId)) {
      // Replay of an already-applied event: 200 keeps Stripe happy without
      // double-processing.
      return 200;
    };

    let eventType = switch (JsonExtract.findString(bodyText, "type")) {
      case (?t) { t };
      case (null) { return 400 };
    };

    let intentId = switch (JsonExtract.findString(bodyText, "client_reference_id")) {
      case (?id) { id };
      case (null) {
        // Stripe events without a client_reference_id are ignored (we only
        // match the ones the SPA initiated). Mark processed so retries stop.
        Set.add(processedStripeEventIds, eventId);
        return 200;
      };
    };

    let intent = switch (paymentIntents.get(intentId)) {
      case (?pi) { pi };
      case (null) {
        // Unknown intent (already pruned, or webhook arrived for a different
        // canister deployment). Acknowledge to silence retries.
        Set.add(processedStripeEventIds, eventId);
        return 200;
      };
    };

    let now = Time.now();
    let target : ?PaymentStatus = if (eventType == "checkout.session.completed") {
      ?#confirmed;
    } else if (eventType == "checkout.session.async_payment_failed") {
      ?#failed;
    } else if (eventType == "checkout.session.expired") {
      ?#expired;
    } else {
      null;
    };

    switch (target) {
      case (null) {
        // Other event types (e.g. session.created) are noise for our flow;
        // acknowledge to stop retries.
        Set.add(processedStripeEventIds, eventId);
      };
      case (?nextStatus) {
        if (intent.status == #pending) {
          let confirmedAt : ?Time.Time = if (nextStatus == #confirmed) ?now else null;
          let updated = {
            intent with
            status = nextStatus;
            updatedAt = now;
            confirmedAt = confirmedAt;
          };
          paymentIntents.add(intentId, updated);
        };
        Set.add(processedStripeEventIds, eventId);
      };
    };
    200;
  };

  // ----- public HTTP gateway endpoints -----

  public query func http_request(req : HttpRequest) : async HttpResponse {
    let path = pathOnly(req.url);
    if (req.method == "POST" and path == STRIPE_WEBHOOK_PATH) {
      // State-mutating: ask the boundary node to re-call as an update.
      return upgradeResponse();
    };
    if (req.method == "GET" and path == STRIPE_HEALTH_PATH) {
      // Re-issue as update so the response bypasses query-response
      // certification (we don't certify any of our HTTP responses).
      return upgradeResponse();
    };
    upgradeResponse();
  };

  public func http_request_update(req : HttpRequest) : async HttpResponse {
    let path = pathOnly(req.url);
    if (req.method == "GET" and path == STRIPE_HEALTH_PATH) {
      return textResponse(200, "ok");
    };
    if (not (req.method == "POST" and path == STRIPE_WEBHOOK_PATH)) {
      return textResponse(404, "Not found");
    };
    let secret = switch (stripeWebhookSecret) {
      case (?s) { s };
      case (null) { return textResponse(503, "Stripe webhook secret not configured") };
    };
    let sigHeader = switch (findHeader(req.headers, "stripe-signature")) {
      case (?h) { h };
      case (null) { return textResponse(400, "Missing Stripe-Signature header") };
    };
    if (not verifyStripeWebhookSignature(req.body, sigHeader, secret)) {
      return textResponse(400, "Bad signature");
    };
    let bodyText = switch (Text.decodeUtf8(req.body)) {
      case (?t) { t };
      case (null) { return textResponse(400, "Body is not valid UTF-8") };
    };
    let status = applyStripeWebhookEvent(bodyText);
    textResponse(status, "ok");
  };

  // Self-test query method for the bootstrap script. Returns true iff a
  // webhook secret is currently configured for `provider`. Used by the slim
  // bootstrap script to verify `configurePaymentWebhookSecrets` actually
  // landed on the canister after a deploy.
  public query func _paymentsConfigured(provider : Text) : async Bool {
    let configured = switch (provider) {
      case ("stripe") { stripeWebhookSecret };
      case ("coinbase") { coinbaseWebhookSecret };
      case (_) { null };
    };
    switch (configured) {
      case (null) { false };
      case (?_) { true };
    };
  };
};
