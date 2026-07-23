/**
 * Portable signing adapter used to sign the outgoing `<soap:Body>`. Implementations may be
 * backed by a `CryptoKey`, an HSM, a remote KMS, or any other key store — the SDK never
 * requires, exports, or persists the private key itself.
 */
export interface EetSigner {
  /** Returns the DER-encoded X.509v3 certificate matching the signing key. */
  getCertificate(): Uint8Array | PromiseLike<Uint8Array>;
  /** Signs `data` with RSASSA-PKCS1-v1_5 / SHA-256 and returns the raw signature bytes. */
  sign(data: Uint8Array): PromiseLike<Uint8Array>;
}
