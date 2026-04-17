import Map "mo:core/Map";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Time "mo:core/Time";
import Principal "mo:core/Principal";
import Order "mo:core/Order";
import Runtime "mo:core/Runtime";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import MixinStorage "blob-storage/Mixin";
import Storage "blob-storage/Storage";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";

actor {
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  private var nextCapsuleId = 0;

  public type CapsuleId = Nat;
  public type Capsule = {
    id : CapsuleId;
    creator : Principal;
    title : Text;
    encryptedMessage : Text;
    fileRefs : [Storage.ExternalBlob];
    unlockDate : Time.Time;
    createdDate : Time.Time;
  };

  public type CapsuleMetadata = {
    id : CapsuleId;
    creator : Principal;
    title : Text;
    unlockDate : Time.Time;
    createdDate : Time.Time;
    isUnlocked : Bool;
  };

  public type UserProfile = {
    name : Text;
  };

  module Capsule {
    public func compare(c1 : Capsule, c2 : Capsule) : Order.Order {
      Nat.compare(c1.id, c2.id);
    };
  };

  module CapsuleMetadata {
    public func compare(c1 : CapsuleMetadata, c2 : CapsuleMetadata) : Order.Order {
      Nat.compare(c1.id, c2.id);
    };
  };

  let capsules = Map.empty<CapsuleId, Capsule>();
  let userProfiles = Map.empty<Principal, UserProfile>();

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
    title : Text,
    encryptedMessage : Text,
    fileRefs : [Storage.ExternalBlob],
    unlockDate : Time.Time,
  ) : async CapsuleId {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can create capsules");
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

    let id = nextCapsuleId;
    let capsule = {
      id;
      creator = caller;
      title;
      encryptedMessage;
      fileRefs;
      unlockDate;
      createdDate = Time.now();
    };
    capsules.add(id, capsule);
    nextCapsuleId += 1;
    id;
  };

  public query ({ caller }) func getCapsuleMetadata(id : CapsuleId) : async CapsuleMetadata {
    let capsule = switch (capsules.get(id)) {
      case (null) { Runtime.trap("Capsule not found") };
      case (?c) { c };
    };

    {
      id = capsule.id;
      creator = capsule.creator;
      title = capsule.title;
      unlockDate = capsule.unlockDate;
      createdDate = capsule.createdDate;
      isUnlocked = Time.now() >= capsule.unlockDate;
    };
  };

  public query ({ caller }) func getCapsuleContent(id : CapsuleId) : async {
    encryptedMessage : Text;
    fileRefs : [Storage.ExternalBlob];
  } {
    let capsule = switch (capsules.get(id)) {
      case (null) { Runtime.trap("Capsule not found") };
      case (?c) { c };
    };

    if (Time.now() < capsule.unlockDate) {
      Runtime.trap("Capsule is still locked until " # capsule.unlockDate.toText());
    };

    {
      encryptedMessage = capsule.encryptedMessage;
      fileRefs = capsule.fileRefs;
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
          id = c.id;
          creator = c.creator;
          title = c.title;
          unlockDate = c.unlockDate;
          createdDate = c.createdDate;
          isUnlocked = Time.now() >= c.unlockDate;
        };
      }
    ).sort();
  };

  public query ({ caller }) func getTotalCapsuleCount() : async Nat {
    capsules.size();
  };
};
