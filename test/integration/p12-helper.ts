import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { decodeBase64 } from "../../src/core/base64.ts";
import type { EetSigner } from "../../src/types/signer.ts";

/**
 * Loads a real playground cash-register certificate/key pair from `caeet/*.p12` for opt-in,
 * non-CI integration tests (see `test/integration/README.md`). Never used by the shipped SDK
 * or by the default test suite. Extraction happens entirely in memory via `openssl pkcs12`
 * (capturing stdout) — nothing sensitive is written to disk, logged, or returned except inside
 * the process memory of the calling test.
 */

const CAEET_DIR = join(import.meta.dirname, "..", "..", "caeet");
const PASSWORD_FILE = join(CAEET_DIR, "password_pokladni_cert_playground.txt");
const RSA_SHA256: RsaHashedImportParams = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

function pemToDer(pem: string): Uint8Array {
  // openssl pkcs12 output includes "Bag Attributes"/subject/issuer metadata lines around the
  // actual PEM block; extract only the base64 body between the real markers.
  const match = pem.match(/-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/);
  if (match?.[1] === undefined) throw new Error("PEM block not found in openssl output.");
  return decodeBase64(match[1].replace(/\s+/g, ""));
}

function runOpenssl(args: string[]): string {
  try {
    return execFileSync("openssl", args, { encoding: "utf8" });
  } catch (error) {
    throw new Error(
      "Extraction from .p12 failed. Requires openssl on PATH with legacy provider support " +
        "(older PKCS#12 files use RC2-40-CBC).",
      { cause: error },
    );
  }
}

export interface PlaygroundP12Signer {
  signer: EetSigner;
  certificatePem: string;
  /** Raw DER bytes backing `signer`, for callers that must reconstruct the signer elsewhere (e.g. inside a browser page via `crypto.subtle`) instead of using `signer` directly. */
  certificateDer: Uint8Array;
  keyDer: Uint8Array;
}

/** `eic` selects `caeet/CA_EET-Playground-<eic>.p12`, e.g. `"CZ8551015704"`. */
export function loadPlaygroundP12Signer(eic: string): PlaygroundP12Signer {
  const p12Path = join(CAEET_DIR, `CA_EET-Playground-${eic}.p12`);
  const passin = `file:${PASSWORD_FILE}`;

  const certificatePem = runOpenssl([
    "pkcs12",
    "-legacy",
    "-in",
    p12Path,
    "-passin",
    passin,
    "-nokeys",
    "-clcerts",
  ]);
  const keyPem = runOpenssl([
    "pkcs12",
    "-legacy",
    "-in",
    p12Path,
    "-passin",
    passin,
    "-nocerts",
    "-nodes",
  ]);

  const certificateDer = pemToDer(certificatePem);
  const keyDer = pemToDer(keyPem);
  let cachedPrivateKey: CryptoKey | undefined;

  const signer: EetSigner = {
    getCertificate: () => certificateDer,
    sign: async (data) => {
      cachedPrivateKey ??= await crypto.subtle.importKey(
        "pkcs8",
        keyDer as BufferSource,
        RSA_SHA256,
        false,
        ["sign"],
      );
      return new Uint8Array(
        await crypto.subtle.sign(RSA_SHA256.name, cachedPrivateKey, data as BufferSource),
      );
    },
  };

  return { signer, certificatePem, certificateDer, keyDer };
}
