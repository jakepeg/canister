// Minimal "find a field by name" helpers for trusted JSON.
//
// Used only after HMAC verification of the Stripe webhook payload — the body
// is then known-good Stripe JSON. A full JSON parser would be overkill for
// the few fields we read (event.id, event.type, data.object.client_reference_id,
// data.object.payment_status, data.object.metadata.tier).

import Char "mo:core/Char";
import Iter "mo:core/Iter";
import Nat32 "mo:core/Nat32";
import Text "mo:core/Text";

module {

  type Chars = [Char];

  // Hoist the special chars so we don't fight with how the parser handles
  // quote characters in inline `'...'` literals.
  let DQ : Char = '\"';
  let BS : Char = '\\';

  /// Find the first occurrence of `"<key>":"<value>"` and return the
  /// JSON-decoded string value. Honors the standard JSON escapes
  /// (`\"`, `\\`, `\/`, `\n`, `\r`, `\t`, `\b`, `\f`, `\uXXXX` BMP-only).
  /// Returns `null` if the key is absent or the value is not a string.
  public func findString(body : Text, key : Text) : ?Text {
    let chars = Iter.toArray<Char>(body.chars());
    let keyChars = Iter.toArray<Char>(("\"" # key # "\"").chars());
    switch (findSubArray(chars, keyChars, 0)) {
      case (null) { null };
      case (?keyEnd) { readStringValueAt(chars, keyEnd) };
    };
  };

  /// Find a string value scoped to the first occurrence of `"<scopeKey>":`,
  /// to disambiguate when the same key name appears at multiple JSON depths
  /// (e.g. extracting `data.object.metadata.tier` rather than any other `tier`).
  public func findStringInScope(body : Text, scopeKey : Text, key : Text) : ?Text {
    let chars = Iter.toArray<Char>(body.chars());
    let scopeChars = Iter.toArray<Char>(("\"" # scopeKey # "\"").chars());
    switch (findSubArray(chars, scopeChars, 0)) {
      case (null) { null };
      case (?scopeEnd) {
        let keyChars = Iter.toArray<Char>(("\"" # key # "\"").chars());
        switch (findSubArray(chars, keyChars, scopeEnd)) {
          case (null) { null };
          case (?keyEnd) { readStringValueAt(chars, keyEnd) };
        };
      };
    };
  };

  // ----- internals -----

  // Find `needle` in `hay` starting at `from`. Returns the index AFTER the
  // last char of the match, or null.
  func findSubArray(hay : Chars, needle : Chars, from : Nat) : ?Nat {
    if (needle.size() == 0) { return ?from };
    if (hay.size() < from + needle.size()) { return null };
    var i = from;
    let last = hay.size() - needle.size();
    while (i <= last) {
      var matched = true;
      var j = 0;
      while (matched and j < needle.size()) {
        if (hay[i + j] != needle[j]) { matched := false };
        j += 1;
      };
      if (matched) { return ?(i + needle.size()) };
      i += 1;
    };
    null;
  };

  // Skips `:` and surrounding whitespace, then expects a string literal
  // (opening `"`) and decodes it.
  func readStringValueAt(chars : Chars, fromIdx : Nat) : ?Text {
    var i = fromIdx;
    var seenColon = false;
    while (i < chars.size()) {
      let c = chars[i];
      if (c == ' ' or c == '\t' or c == '\n' or c == '\r') {
        i += 1;
      } else if (c == ':') {
        if (seenColon) { return null };
        seenColon := true;
        i += 1;
      } else if (seenColon and c == DQ) {
        return decodeStringFrom(chars, i + 1);
      } else if (seenColon) {
        return null;
      } else {
        return null;
      };
    };
    null;
  };

  // Reads a JSON string body up to the closing `"`. `start` points to the
  // first char inside the string.
  func decodeStringFrom(chars : Chars, start : Nat) : ?Text {
    var out = "";
    var i = start;
    while (i < chars.size()) {
      let c = chars[i];
      if (c == DQ) {
        return ?out;
      } else if (c == BS) {
        if (i + 1 >= chars.size()) { return null };
        let esc = chars[i + 1];
        if (esc == DQ) {
          out #= "\"";
          i += 2;
        } else if (esc == BS) {
          out #= "\\";
          i += 2;
        } else if (esc == '/') {
          out #= "/";
          i += 2;
        } else if (esc == 'n') {
          out #= "\n";
          i += 2;
        } else if (esc == 'r') {
          out #= "\r";
          i += 2;
        } else if (esc == 't') {
          out #= "\t";
          i += 2;
        } else if (esc == 'b') {
          out #= "\u{0008}";
          i += 2;
        } else if (esc == 'f') {
          out #= "\u{000c}";
          i += 2;
        } else if (esc == 'u') {
          if (i + 5 >= chars.size()) { return null };
          var code : Nat32 = 0;
          var k = 0;
          while (k < 4) {
            switch (hexNibble(chars[i + 2 + k])) {
              case (null) { return null };
              case (?n) { code := (code << 4) | n };
            };
            k += 1;
          };
          out #= Text.fromChar(Char.fromNat32(code));
          i += 6;
        } else {
          return null;
        };
      } else {
        out #= Text.fromChar(c);
        i += 1;
      };
    };
    null;
  };

  func hexNibble(c : Char) : ?Nat32 {
    let code = Char.toNat32(c);
    if (code >= 0x30 and code <= 0x39) {
      ?(code - 0x30);
    } else if (code >= 0x61 and code <= 0x66) {
      ?(code - 0x61 + 10);
    } else if (code >= 0x41 and code <= 0x46) {
      ?(code - 0x41 + 10);
    } else {
      null;
    };
  };
};
