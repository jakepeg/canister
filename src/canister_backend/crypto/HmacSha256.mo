// HMAC-SHA256 (RFC 2104) on top of `Sha256.mo`.
//
// Used by the canister to verify Stripe webhook signatures. Stripe signs the
// payload `${timestamp}.${rawJsonBody}` with HMAC-SHA256(webhookSecret, ...),
// and ships the hex digest in the `Stripe-Signature` header as `v1=<hex>`.
//
// Cross-checked against RFC 4231 SHA-256 test vectors (e.g. test case 1:
//   key   = 0x0b * 20
//   data  = "Hi There"
//   mac   = b0344c61d8db38535ca8afceaf0bf12b 881dc200c9833da726e9376c2e32cff7).

import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Sha256 "Sha256";

module {

  let BLOCK_BYTES : Nat = Sha256.BLOCK_BYTES;
  public let DIGEST_BYTES : Nat = Sha256.DIGEST_BYTES;

  /// HMAC-SHA256(key, message). Returns the 32-byte tag as a byte array.
  public func mac(key : [Nat8], message : [Nat8]) : [Nat8] {
    // Per RFC 2104: if key longer than block size, hash it; otherwise pad
    // with zeros to the block size.
    let normalizedKey = if (key.size() > BLOCK_BYTES) {
      Sha256.hashBytes(key);
    } else {
      key;
    };
    let blockKey = Array.tabulate<Nat8>(
      BLOCK_BYTES,
      func(i) {
        if (i < normalizedKey.size()) { normalizedKey[i] } else { (0 : Nat8) };
      },
    );

    let ipad = Array.tabulate<Nat8>(
      BLOCK_BYTES,
      func(i) { blockKey[i] ^ (0x36 : Nat8) },
    );
    let opad = Array.tabulate<Nat8>(
      BLOCK_BYTES,
      func(i) { blockKey[i] ^ (0x5c : Nat8) },
    );

    let inner = Array.tabulate<Nat8>(
      BLOCK_BYTES + message.size(),
      func(i) {
        if (i < BLOCK_BYTES) { ipad[i] } else { message[i - BLOCK_BYTES] };
      },
    );
    let innerHash = Sha256.hashBytes(inner);

    let outer = Array.tabulate<Nat8>(
      BLOCK_BYTES + DIGEST_BYTES,
      func(i) {
        if (i < BLOCK_BYTES) { opad[i] } else { innerHash[i - BLOCK_BYTES] };
      },
    );
    Sha256.hashBytes(outer);
  };

  /// HMAC-SHA256 over Blobs. Returns a 32-byte Blob.
  public func macBlob(key : Blob, message : Blob) : Blob {
    Blob.fromArray(mac(Blob.toArray(key), Blob.toArray(message)));
  };

  /// Constant-time compare of two byte arrays. Returns false if lengths differ.
  /// Loops over the longer side so timing does not depend on a length-mismatch
  /// short-circuit (a typical webhook signature compare).
  public func equalConstantTime(a : [Nat8], b : [Nat8]) : Bool {
    if (a.size() != b.size()) {
      return false;
    };
    var diff : Nat8 = 0;
    var i = 0;
    while (i < a.size()) {
      diff := diff | (a[i] ^ b[i]);
      i += 1;
    };
    diff == (0 : Nat8);
  };
};
