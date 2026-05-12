// Hex helpers for parsing the Stripe-Signature header (`v1=<lowercase-hex>`)
// and emitting/printing digests.

import Array "mo:core/Array";
import Char "mo:core/Char";
import Iter "mo:core/Iter";
import Nat32 "mo:core/Nat32";
import Nat8 "mo:core/Nat8";
import Text "mo:core/Text";

module {

  /// Lower-case hex string (no `0x` prefix, no separators).
  public func encode(bytes : [Nat8]) : Text {
    var out = "";
    for (b in bytes.vals()) {
      let hi : Nat8 = (b >> 4) & (0x0f : Nat8);
      let lo : Nat8 = b & (0x0f : Nat8);
      out #= nibbleToChar(hi);
      out #= nibbleToChar(lo);
    };
    out;
  };

  /// Decodes a hex string to bytes. Returns null on any non-hex char or odd
  /// length. Accepts upper- or lower-case input.
  public func decode(hex : Text) : ?[Nat8] {
    let chars = Iter.toArray<Char>(hex.chars());
    if (chars.size() % 2 != 0) { return null };
    let n = chars.size() / 2;
    let buf = Array.tabulate<?Nat8>(
      n,
      func(i) {
        switch (charToNibble(chars[2 * i]), charToNibble(chars[2 * i + 1])) {
          case (?hi, ?lo) { ?((hi << 4) | lo) };
          case _ { null };
        };
      },
    );
    var anyNull = false;
    for (entry in buf.vals()) {
      switch (entry) {
        case (null) { anyNull := true };
        case (_) {};
      };
    };
    if (anyNull) { return null };
    ?Array.tabulate<Nat8>(
      n,
      func(i) {
        switch (buf[i]) {
          case (?b) { b };
          case (null) { 0 };
        };
      },
    );
  };

  func nibbleToChar(n : Nat8) : Text {
    if (n < 10) {
      // '0' = 0x30
      Text.fromChar(Char.fromNat32(0x30 + Nat32.fromNat(Nat8.toNat(n))));
    } else {
      // 'a' = 0x61
      Text.fromChar(Char.fromNat32(0x61 + Nat32.fromNat(Nat8.toNat(n) - 10)));
    };
  };

  func charToNibble(c : Char) : ?Nat8 {
    let code = Char.toNat32(c);
    if (code >= 0x30 and code <= 0x39) {
      ?Nat8.fromNat(Nat32.toNat(code - 0x30));
    } else if (code >= 0x61 and code <= 0x66) {
      ?Nat8.fromNat(Nat32.toNat(code - 0x61 + 10));
    } else if (code >= 0x41 and code <= 0x46) {
      ?Nat8.fromNat(Nat32.toNat(code - 0x41 + 10));
    } else {
      null;
    };
  };
};
