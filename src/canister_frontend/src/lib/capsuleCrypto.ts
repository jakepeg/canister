/** AES-GCM file payloads use the same 256-bit key as the sealed message (IV + ciphertext per blob). */

async function importAesGcmKeyFromBase64(keyBase64: string): Promise<CryptoKey> {
  const keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytesWithAesGcm(
  plaintext: Uint8Array,
  keyBase64: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importAesGcmKeyFromBase64(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new Uint8Array(plaintext.byteLength);
  pt.set(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    pt,
  );
  const out = new Uint8Array(iv.length + encrypted.byteLength) as Uint8Array<ArrayBuffer>;
  out.set(iv, 0);
  out.set(new Uint8Array(encrypted), iv.length);
  return out;
}

export async function decryptBytesWithAesGcm(
  ciphertext: Uint8Array,
  keyBase64: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importAesGcmKeyFromBase64(keyBase64);
  if (ciphertext.byteLength < 13) {
    throw new Error("Invalid ciphertext");
  }
  const iv = ciphertext.slice(0, 12);
  const data = ciphertext.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new Uint8Array(decrypted) as Uint8Array<ArrayBuffer>;
}
