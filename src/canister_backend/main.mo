import Map "mo:core/Map";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Time "mo:core/Time";
import Principal "mo:core/Principal";
import Order "mo:core/Order";
import Runtime "mo:core/Runtime";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import MixinStorage "blob-storage/Mixin";
import Storage "blob-storage/Storage";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";

persistent actor {
  transient let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  private transient var nextCapsuleId = 0;

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
  };

  public type CapsuleMetadata = {
    id : Text;
    creator : Principal;
    title : Text;
    unlockDate : Time.Time;
    createdDate : Time.Time;
    isUnlocked : Bool;
    planTier : PlanTier;
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
  };

  public type UserProfile = {
    name : Text;
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

  transient let capsules = Map.empty<CapsuleId, Capsule>();
  transient let capsuleIdsByPublicId = Map.empty<Text, CapsuleId>();
  transient let userProfiles = Map.empty<Principal, UserProfile>();
  transient let paymentIntents = Map.empty<Text, PaymentIntent>();
  transient let storedFiles = Map.empty<Text, StoredFile>();

  private transient var nextPaymentIntentId : Nat = 0;
  private transient var nextStoredFileId : Nat = 0;
  private transient var stripeWebhookSecret : ?Text = null;
  private transient var coinbaseWebhookSecret : ?Text = null;

  private let FREE_INCLUDED_CANISTERS : Nat = 1;
  private let FREE_MAX_MESSAGE_CHARS : Nat = 200;
  private let PAYMENT_INTENT_TTL_NS : Int = 15 * 60 * 1_000_000_000;
  private let MAX_FILE_BYTES : Nat = 5 * 1024 * 1024;
  private let MAX_FILES_PER_CAPSULE : Nat = 8;
  private let MAX_TOTAL_ATTACHMENT_BYTES : Nat = 20 * 1024 * 1024;

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

  private func providerCheckoutBase(provider : PaymentProvider) : Text {
    switch (provider) {
      case (#stripe) { "https://checkout.timecanister.app/stripe" };
      case (#coinbase) { "https://checkout.timecanister.app/coinbase" };
      case (#voucher) { "https://checkout.timecanister.app/voucher" };
    };
  };

  private func isExpired(intent : PaymentIntent) : Bool {
    Time.now() > intent.expiresAt;
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
    };
  };

  // User profile management functions
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
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

  // Time capsule functions
  public shared ({ caller }) func createCapsule(
    publicId : Text,
    title : Text,
    encryptedMessage : Text,
    fileRefs : [Storage.ExternalBlob],
    unlockDate : Time.Time,
    messageCharCount : Nat,
    paymentIntentId : ?Text,
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

    if (unlockDate <= Time.now()) {
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

    if (planTier == #free) {
      if (messageCharCount > FREE_MAX_MESSAGE_CHARS) {
        Runtime.trap("Free plan allows a maximum of 200 message characters.");
      };
      if (fileRefs.size() > 0) {
        Runtime.trap("Free plan does not include file uploads.");
      };
    } else {
      if (fileRefs.size() > MAX_FILES_PER_CAPSULE) {
        Runtime.trap("Too many files for one capsule.");
      };

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

        totalAttachmentBytes += stored.sizeBytes;
      };

      if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        Runtime.trap("Total attachment size exceeds capsule limit.");
      };
    };

    let id = nextCapsuleId;
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
      };
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
    if (fileSize > MAX_FILE_BYTES) {
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

  public query ({ caller = _ }) func getCapsuleMetadata(id : Text) : async CapsuleMetadata {
    let capsule = getCapsuleByPublicId(id);

    {
      id = capsule.publicId;
      creator = capsule.creator;
      title = capsule.title;
      unlockDate = capsule.unlockDate;
      createdDate = capsule.createdDate;
      isUnlocked = Time.now() >= capsule.unlockDate;
      planTier = capsule.planTier;
    };
  };

  public query ({ caller = _ }) func getCapsuleContent(id : Text) : async {
    encryptedMessage : Text;
    fileRefs : [Storage.ExternalBlob];
  } {
    let capsule = getCapsuleByPublicId(id);

    if (Time.now() < capsule.unlockDate) {
      Runtime.trap("Capsule is still locked until " # Int.toText(capsule.unlockDate));
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

    if (Time.now() < capsule.unlockDate) {
      Runtime.trap("Capsule is still locked");
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
          isUnlocked = Time.now() >= c.unlockDate;
          planTier = c.planTier;
        };
      }
    ).sort();
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
    };
    paymentIntents.add(intentId, intent);
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
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized");
    };
    stripeWebhookSecret := stripe;
    coinbaseWebhookSecret := coinbase;
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

    if (requiresSecretCheck and not AccessControl.isAdmin(accessControlState, caller)) {
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
};
