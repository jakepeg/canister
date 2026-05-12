// SHA-256 (FIPS 180-4) in pure Motoko.
//
// We use this on-canister to verify Stripe webhook signatures so the project
// no longer needs a separate Node relay running `stripe.webhooks.constructEvent`.
//
// Cross-checked against the FIPS 180-2 test vectors:
//   "abc"
//     -> ba7816bf 8f01cfea 414140de 5dae2223 b00361a3 96177a9c b410ff61 f20015ad
//   "" (empty)
//     -> e3b0c442 98fc1c14 9afbf4c8 996fb924 27ae41e4 649b934c a495991b 7852b855

import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Text "mo:core/Text";
import VarArray "mo:core/VarArray";

module {

  // SHA-256 round constants K[0..63].
  let K : [Nat32] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let H0 : [Nat32] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  func rotr(x : Nat32, n : Nat32) : Nat32 {
    (x >> n) | (x << (32 - n));
  };

  func ch(x : Nat32, y : Nat32, z : Nat32) : Nat32 {
    (x & y) ^ ((^x) & z);
  };

  func maj(x : Nat32, y : Nat32, z : Nat32) : Nat32 {
    (x & y) ^ (x & z) ^ (y & z);
  };

  func bigSigma0(x : Nat32) : Nat32 {
    rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
  };

  func bigSigma1(x : Nat32) : Nat32 {
    rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
  };

  func smallSigma0(x : Nat32) : Nat32 {
    rotr(x, 7) ^ rotr(x, 18) ^ (x >> 3);
  };

  func smallSigma1(x : Nat32) : Nat32 {
    rotr(x, 17) ^ rotr(x, 19) ^ (x >> 10);
  };

  // Pad `msg` per FIPS 180-4: append 0x80, then zero bytes until length mod 64
  // == 56, then 8-byte big-endian bit length. Result length is a multiple of 64.
  func pad(msg : [Nat8]) : [Nat8] {
    let n = msg.size();
    let bitLen : Nat64 = Nat64.fromNat(n) * 8;
    let withMarkerLen = n + 1;
    let zerosNeeded : Nat = if (withMarkerLen % 64 <= 56) {
      56 - (withMarkerLen % 64);
    } else {
      120 - (withMarkerLen % 64);
    };
    Array.tabulate<Nat8>(
      n + 1 + zerosNeeded + 8,
      func(i) {
        if (i < n) {
          msg[i];
        } else if (i == n) {
          (0x80 : Nat8);
        } else if (i < n + 1 + zerosNeeded) {
          (0 : Nat8);
        } else {
          let shift : Nat64 = 56 - 8 * Nat64.fromNat(i - (n + 1 + zerosNeeded));
          Nat8.fromNat(Nat64.toNat((bitLen >> shift) & 0xff));
        };
      },
    );
  };

  // Read 4 big-endian bytes from `bytes` starting at `offset` into a Nat32.
  func readBeNat32(bytes : [Nat8], offset : Nat) : Nat32 {
    let b0 : Nat32 = Nat32.fromNat(Nat8.toNat(bytes[offset]));
    let b1 : Nat32 = Nat32.fromNat(Nat8.toNat(bytes[offset + 1]));
    let b2 : Nat32 = Nat32.fromNat(Nat8.toNat(bytes[offset + 2]));
    let b3 : Nat32 = Nat32.fromNat(Nat8.toNat(bytes[offset + 3]));
    (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
  };

  // Process a single 64-byte block, mutating the working hash state `h`.
  func compress(h : [var Nat32], block : [Nat8], blockOffset : Nat) {
    let w = VarArray.tabulate<Nat32>(
      64,
      func(i) {
        if (i < 16) {
          readBeNat32(block, blockOffset + i * 4);
        } else {
          0;
        };
      },
    );
    var i = 16;
    while (i < 64) {
      w[i] := smallSigma1(w[i - 2]) +% w[i - 7] +% smallSigma0(w[i - 15]) +% w[i - 16];
      i += 1;
    };

    var a = h[0];
    var b = h[1];
    var c = h[2];
    var d = h[3];
    var e = h[4];
    var f = h[5];
    var g = h[6];
    var hh = h[7];

    var t = 0;
    while (t < 64) {
      let t1 = hh +% bigSigma1(e) +% ch(e, f, g) +% K[t] +% w[t];
      let t2 = bigSigma0(a) +% maj(a, b, c);
      hh := g;
      g := f;
      f := e;
      e := d +% t1;
      d := c;
      c := b;
      b := a;
      a := t1 +% t2;
      t += 1;
    };

    h[0] := h[0] +% a;
    h[1] := h[1] +% b;
    h[2] := h[2] +% c;
    h[3] := h[3] +% d;
    h[4] := h[4] +% e;
    h[5] := h[5] +% f;
    h[6] := h[6] +% g;
    h[7] := h[7] +% hh;
  };

  /// SHA-256 over a byte array. Returns 32 raw digest bytes.
  public func hashBytes(msg : [Nat8]) : [Nat8] {
    let padded = pad(msg);
    let h = VarArray.tabulate<Nat32>(8, func(i) { H0[i] });
    var offset = 0;
    while (offset < padded.size()) {
      compress(h, padded, offset);
      offset += 64;
    };
    Array.tabulate<Nat8>(
      32,
      func(i) {
        let word = h[i / 4];
        let shift : Nat32 = 24 - 8 * Nat32.fromNat(i % 4);
        Nat8.fromNat(Nat32.toNat((word >> shift) & 0xff));
      },
    );
  };

  /// SHA-256 over a Blob. Returns a 32-byte Blob.
  public func hashBlob(msg : Blob) : Blob {
    Blob.fromArray(hashBytes(Blob.toArray(msg)));
  };

  /// SHA-256 over the UTF-8 bytes of a Text. Returns a 32-byte Blob.
  public func hashText(s : Text) : Blob {
    hashBlob(Text.encodeUtf8(s));
  };

  public let BLOCK_BYTES : Nat = 64;
  public let DIGEST_BYTES : Nat = 32;
};
