import { createEetClient } from "../client.ts";
import { encodeBase64 } from "../core/base64.ts";
import { bytesEqual } from "../core/bytes.ts";
import { type ParseResponseContext, parseAndVerifyResponse } from "../core/parse-response.ts";
import type { EetCryptoBackend } from "../core/webcrypto.ts";
import { parsePkcs12 } from "../pkcs12/parse.ts";
import { trySync } from "../result.ts";
import type { EetClientOptions } from "../types/client.ts";
import { createEetSignatureError, createEetSignerError } from "../types/errors.ts";
import type { EetSigner } from "../types/signer.ts";
import type { ResponseSignatureVerifier } from "../types/verifier.ts";

export * from "../index.ts";
export * from "../pkcs12/index.ts";

interface QuickCryptoHash {
  update(data: Uint8Array): QuickCryptoHash;
  digest(): Uint8Array;
}

/** Structural subset of Quick Crypto; no native module is loaded by this entry point. */
export interface QuickCryptoBackend<PrivateKey, PublicKey> {
  createHash(algorithm: string): QuickCryptoHash;
  createHmac(algorithm: string, key: Uint8Array): QuickCryptoHash;
  randomUUID(): string;
  createPrivateKey(key: string): PrivateKey;
  createPublicKey(key: string): PublicKey;
  sign(algorithm: string, data: Uint8Array, key: PrivateKey): Uint8Array;
  verify(algorithm: string, data: Uint8Array, key: PublicKey, signature: Uint8Array): boolean;
}

function pem(label: string, der: Uint8Array): string {
  return `-----BEGIN ${label}-----\n${encodeBase64(der)}\n-----END ${label}-----`;
}

export function createReactNativeCrypto<PrivateKey, PublicKey>(
  crypto: QuickCryptoBackend<PrivateKey, PublicKey>,
) {
  const backend: EetCryptoBackend = {
    async digest(algorithm, data) {
      return crypto
        .createHash(algorithm === "SHA-1" ? "sha1" : "sha256")
        .update(data)
        .digest();
    },
    async hmacSha1(key, data) {
      return crypto.createHmac("sha1", key).update(data).digest();
    },
    randomUuid: () => crypto.randomUUID(),
  };

  return {
    cryptoBackend: backend,
    parsePkcs12: (data: Uint8Array, password: string) => parsePkcs12(data, password, backend),
    importPrivateKey: (pkcs8: Uint8Array) =>
      trySync(
        () => crypto.createPrivateKey(pem("PRIVATE KEY", pkcs8)),
        (cause) => createEetSignerError({ message: "Failed to import PKCS#8 key.", cause }),
      ),
    importPublicKey: (spki: Uint8Array) =>
      trySync(
        () => crypto.createPublicKey(pem("PUBLIC KEY", spki)),
        (cause) => createEetSignatureError({ message: "Failed to import SPKI key.", cause }),
      ),
    createSigner: (certificateDer: Uint8Array, privateKey: PrivateKey): EetSigner => ({
      getCertificate: () => certificateDer,
      sign: async (data) => crypto.sign("RSA-SHA256", data, privateKey),
    }),
    createResponseSignatureVerifier: (
      publicKey: PublicKey,
      trustedCertificateDer: Uint8Array,
    ): ResponseSignatureVerifier => ({
      async verify({ signature }) {
        const leaf = signature.certificates[0];
        return (
          leaf !== undefined &&
          bytesEqual(leaf, trustedCertificateDer) &&
          crypto.verify(
            "RSA-SHA256",
            signature.signedInfoCanonical,
            publicKey,
            signature.signatureValue,
          )
        );
      },
    }),
    createEetClient: (options: Omit<EetClientOptions, "cryptoBackend">) =>
      createEetClient({ ...options, cryptoBackend: backend }),
    parseAndVerifyResponse: (raw: string, context: Omit<ParseResponseContext, "cryptoBackend">) =>
      parseAndVerifyResponse(raw, { ...context, cryptoBackend: backend }),
  };
}
