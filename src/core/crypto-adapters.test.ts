import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EetParsedSignature, EetVerifySignatureInput } from "../types/verifier.ts";
import {
  createCryptoKeyResponseSignatureVerifier,
  createCryptoKeySigner,
} from "./crypto-adapters.ts";

const RSA_SHA256: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

async function generateKeyPair(extractable = false): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_SHA256, extractable, [
    "sign",
    "verify",
  ]) as Promise<CryptoKeyPair>;
}

function verifyInput(overrides: Partial<EetParsedSignature>): EetVerifySignatureInput {
  const signature: EetParsedSignature = {
    signedBodyCanonical: new Uint8Array(),
    signedInfoCanonical: new Uint8Array(),
    signatureValue: new Uint8Array(),
    digestValue: new Uint8Array(),
    certificates: [],
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    ...overrides,
  };
  return { raw: "", signature };
}

describe("createCryptoKeySigner", () => {
  test("getCertificate returns the certificate as-is and sign() produces a verifiable signature", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const certificateDer = new Uint8Array([1, 2, 3]);
    const signer = createCryptoKeySigner(certificateDer, privateKey);

    assert.strictEqual(await signer.getCertificate(), certificateDer);

    const data = new TextEncoder().encode("signed-info-bytes");
    const signature = await signer.sign(data);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature as BufferSource,
      data,
    );
    assert.strictEqual(valid, true);
  });
});

describe("createCryptoKeyResponseSignatureVerifier", () => {
  test("accepts a signature matching the pinned certificate and public key", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const trustedCertificateDer = new Uint8Array([9, 9, 9]);
    const signedInfoCanonical = new TextEncoder().encode("<ds:SignedInfo>...</ds:SignedInfo>");
    const signatureValue = new Uint8Array(
      await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, signedInfoCanonical),
    );

    const verifier = createCryptoKeyResponseSignatureVerifier(publicKey, trustedCertificateDer);
    const accepted = await verifier.verify(
      verifyInput({
        certificates: [trustedCertificateDer],
        signedInfoCanonical,
        signatureValue,
      }),
    );
    assert.strictEqual(accepted, true);
  });

  test("accepts a public key passed as raw SPKI DER bytes instead of a CryptoKey", async () => {
    const { privateKey, publicKey } = await generateKeyPair(true);
    const publicKeySpkiDer = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
    const trustedCertificateDer = new Uint8Array([9, 9, 9]);
    const signedInfoCanonical = new TextEncoder().encode("<ds:SignedInfo>...</ds:SignedInfo>");
    const signatureValue = new Uint8Array(
      await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, signedInfoCanonical),
    );

    const verifier = createCryptoKeyResponseSignatureVerifier(
      publicKeySpkiDer,
      trustedCertificateDer,
    );
    const accepted = await verifier.verify(
      verifyInput({
        certificates: [trustedCertificateDer],
        signedInfoCanonical,
        signatureValue,
      }),
    );
    assert.strictEqual(accepted, true);
  });

  test("rejects when the response's leaf certificate does not match the pinned certificate", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const trustedCertificateDer = new Uint8Array([9, 9, 9]);
    const signedInfoCanonical = new TextEncoder().encode("<ds:SignedInfo>...</ds:SignedInfo>");
    const signatureValue = new Uint8Array(
      await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, signedInfoCanonical),
    );

    const verifier = createCryptoKeyResponseSignatureVerifier(publicKey, trustedCertificateDer);
    const accepted = await verifier.verify(
      verifyInput({
        certificates: [new Uint8Array([1, 1, 1])],
        signedInfoCanonical,
        signatureValue,
      }),
    );
    assert.strictEqual(accepted, false);
  });

  test("rejects when no certificate is present in the response", async () => {
    const { publicKey } = await generateKeyPair();
    const verifier = createCryptoKeyResponseSignatureVerifier(publicKey, new Uint8Array([9, 9, 9]));
    const accepted = await verifier.verify(verifyInput({ certificates: [] }));
    assert.strictEqual(accepted, false);
  });

  test("rejects when the signature does not match signedInfoCanonical", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const trustedCertificateDer = new Uint8Array([9, 9, 9]);
    const signatureValue = new Uint8Array(
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        privateKey,
        new TextEncoder().encode("original"),
      ),
    );

    const verifier = createCryptoKeyResponseSignatureVerifier(publicKey, trustedCertificateDer);
    const accepted = await verifier.verify(
      verifyInput({
        certificates: [trustedCertificateDer],
        signedInfoCanonical: new TextEncoder().encode("tampered"),
        signatureValue,
      }),
    );
    assert.strictEqual(accepted, false);
  });

  test("rejects when the signature was produced by a different key", async () => {
    const signerKeyPair = await generateKeyPair();
    const { publicKey: unrelatedPublicKey } = await generateKeyPair();
    const trustedCertificateDer = new Uint8Array([9, 9, 9]);
    const signedInfoCanonical = new TextEncoder().encode("<ds:SignedInfo>...</ds:SignedInfo>");
    const signatureValue = new Uint8Array(
      await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signerKeyPair.privateKey, signedInfoCanonical),
    );

    const verifier = createCryptoKeyResponseSignatureVerifier(
      unrelatedPublicKey,
      trustedCertificateDer,
    );
    const accepted = await verifier.verify(
      verifyInput({
        certificates: [trustedCertificateDer],
        signedInfoCanonical,
        signatureValue,
      }),
    );
    assert.strictEqual(accepted, false);
  });

  test("does not import publicKey (and cannot produce an unhandled rejection) until verify() is called", async () => {
    const malformedSpkiDer = new Uint8Array([1, 2, 3]); // not a well-formed SPKI structure
    let unhandledReason: unknown;
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledReason = reason;
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      // Constructing the verifier must defer the SPKI import to the first `verify()` call — if it
      // imported eagerly here instead, this malformed key would reject a promise nobody is
      // awaiting yet, surfacing as an unhandled rejection.
      createCryptoKeyResponseSignatureVerifier(malformedSpkiDer, new Uint8Array([9, 9, 9]));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
    assert.strictEqual(unhandledReason, undefined);
  });

  test("surfaces a malformed publicKey as a rejected verify() call instead of an unhandled rejection", async () => {
    const malformedSpkiDer = new Uint8Array([1, 2, 3]);
    const trustedCertificateDer = new Uint8Array([9, 9, 9]);
    const verifier = createCryptoKeyResponseSignatureVerifier(
      malformedSpkiDer,
      trustedCertificateDer,
    );

    await assert.rejects(async () => {
      await verifier.verify(
        verifyInput({
          certificates: [trustedCertificateDer],
          signedInfoCanonical: new TextEncoder().encode("<ds:SignedInfo>...</ds:SignedInfo>"),
          signatureValue: new Uint8Array([1, 2, 3]),
        }),
      );
    });
  });
});
