/**
 * Thin wrapper around the Web Crypto API (`globalThis.crypto`, stable in Node.js since v19,
 * Bun, and every modern browser) used for the one fixed operation the SDK itself performs: the
 * mandatory SHA-256 body digest. Signing and signature verification are always delegated to the
 * `signer`/`responseSignatureVerifier` adapters, never performed here.
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(digest);
}
