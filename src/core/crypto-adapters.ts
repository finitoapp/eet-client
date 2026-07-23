import type { EetSigner } from "../types/signer.ts";
import type { ResponseSignatureVerifier } from "../types/verifier.ts";
import { bytesEqual } from "./bytes.ts";

const RSASSA_PKCS1_V1_5 = "RSASSA-PKCS1-v1_5";

/**
 * Builds an {@link EetSigner} directly from a Web Crypto `CryptoKey` and the matching
 * DER-encoded X.509 certificate: `getCertificate()` returns `certificateDer` as-is, `sign()`
 * delegates to `crypto.subtle.sign`. `privateKey` must support `RSASSA-PKCS1-v1_5`/SHA-256
 * signing (e.g. imported via `crypto.subtle.importKey("pkcs8", ..., { name:
 * "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])`) — this SDK never loads, converts,
 * or parses `.p12`/PFX files itself; see the README for how to derive `privateKey`/
 * `certificateDer` from one.
 */
export function createCryptoKeySigner(
  certificateDer: Uint8Array,
  privateKey: CryptoKey,
): EetSigner {
  return {
    getCertificate: () => certificateDer,
    sign: async (data) =>
      new Uint8Array(await crypto.subtle.sign(RSASSA_PKCS1_V1_5, privateKey, data as BufferSource)),
  };
}

/**
 * Builds a {@link ResponseSignatureVerifier} that pins a single trusted certificate: a response
 * is accepted only if its leaf certificate (`signature.certificates[0]`) is byte-for-byte equal
 * to `trustedCertificateDer` and the RSA-SHA256 signature verifies against `publicKey`.
 *
 * This is certificate pinning, not chain-of-trust validation — it never inspects the issuer,
 * validity period, or revocation status, and there is no fallback to a CA root. `publicKey`
 * must be the SPKI-encoded public key extracted from `trustedCertificateDer`, either already
 * imported as a `CryptoKey`, or as raw SPKI DER bytes — passed as `Uint8Array`, it is imported
 * once (lazily, on the first `verify()` call) using the fixed `RSASSA-PKCS1-v1_5`/SHA-256
 * parameters this SDK always uses — only pin certificates you have independently verified belong
 * to the intended EET endpoint.
 */
export function createCryptoKeyResponseSignatureVerifier(
  publicKey: CryptoKey | Uint8Array,
  trustedCertificateDer: Uint8Array,
): ResponseSignatureVerifier {
  // Importing raw SPKI bytes eagerly here would create a promise before any `verify()` call ever
  // observes it — if `publicKey` is malformed, that rejection would be unhandled. Deferring
  // creation into `importPublicKey`, called only from `verify()`, keeps the promise (and any
  // rejection) always awaited, while `publicKeyPromise` still memoizes it across repeated calls.
  let publicKeyPromise: PromiseLike<CryptoKey> | undefined;
  const importPublicKey = (): PromiseLike<CryptoKey> => {
    if (publicKeyPromise === undefined) {
      publicKeyPromise =
        publicKey instanceof Uint8Array
          ? crypto.subtle.importKey(
              "spki",
              publicKey as BufferSource,
              { name: RSASSA_PKCS1_V1_5, hash: "SHA-256" },
              false,
              ["verify"],
            )
          : Promise.resolve(publicKey);
    }
    return publicKeyPromise;
  };

  return {
    verify: async ({ signature }) => {
      const leaf = signature.certificates[0];
      if (leaf === undefined || !bytesEqual(leaf, trustedCertificateDer)) return false;
      return crypto.subtle.verify(
        RSASSA_PKCS1_V1_5,
        await importPublicKey(),
        signature.signatureValue as BufferSource,
        signature.signedInfoCanonical as BufferSource,
      );
    },
  };
}
