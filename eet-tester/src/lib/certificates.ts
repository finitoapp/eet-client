import {
  createCryptoKeyResponseSignatureVerifier,
  createCryptoKeySigner,
  type EetSigner,
  err,
  ok,
  type ResponseSignatureVerifier,
  type Result,
} from "@finitoapp/eet-client";
import {
  isPkcs12Error,
  parsePkcs12,
  pickPrivateKeyCertificate,
} from "@finitoapp/eet-client/pkcs12";
import { describeError } from "./errors.ts";

const SIGNING_ALGORITHM = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

export interface LoadedSigner {
  readonly signer: EetSigner;
  readonly friendlyName: string | undefined;
  readonly fingerprintHex: string;
}

export type LoadSignerError =
  | { readonly type: "invalidPassword" }
  | { readonly type: "malformed"; readonly message: string }
  | { readonly type: "noCertificateOrKey" }
  | { readonly type: "importKeyFailed"; readonly message: string };

/**
 * Turns an uploaded `.p12`/PFX file into a ready-to-use {@link EetSigner}: parses the container,
 * picks the certificate matching the private key (via `localKeyId`, falling back to the first
 * certificate when the key carries none), and imports the key into Web Crypto.
 */
export async function loadSignerFromPkcs12(
  data: Uint8Array,
  password: string,
): Promise<Result<LoadedSigner, LoadSignerError>> {
  const parsed = await parsePkcs12(data, password);
  if (!parsed.ok) {
    return isPkcs12Error(parsed.error, "Pkcs12InvalidMacError")
      ? err({ type: "invalidPassword" })
      : err({ type: "malformed", message: parsed.error.message });
  }

  const certificate = pickPrivateKeyCertificate(parsed.value);
  if (certificate === undefined || parsed.value.privateKey === undefined) {
    return err({ type: "noCertificateOrKey" });
  }

  try {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      parsed.value.privateKey.der as BufferSource,
      SIGNING_ALGORITHM,
      false,
      ["sign"],
    );
    const fingerprintHex = await sha256Hex(certificate.der);
    return ok({
      signer: createCryptoKeySigner(certificate.der, privateKey),
      friendlyName: certificate.friendlyName,
      fingerprintHex,
    });
  } catch (cause) {
    return err({ type: "importKeyFailed", message: describeError(cause) });
  }
}

/** A response-signature verifier that trusts every response, for first-time key discovery only. */
export interface InsecureVerifier {
  readonly verifier: ResponseSignatureVerifier;
  /** The leaf certificate DER from the most recently verified response, if any. */
  getLastLeafCertificateDer(): Uint8Array | undefined;
}

export function createInsecureAlwaysTrustVerifier(): InsecureVerifier {
  let lastLeaf: Uint8Array | undefined;
  return {
    verifier: {
      verify: async (input) => {
        lastLeaf = input.signature.certificates[0];
        return true;
      },
    },
    getLastLeafCertificateDer: () => lastLeaf,
  };
}

export type LoadVerifierError = { readonly message: string };

/**
 * Builds a pinning {@link ResponseSignatureVerifier} from a user-uploaded trusted certificate
 * (`.der` or PEM-encoded `.pem`/`.crt`). `createCryptoKeyResponseSignatureVerifier` needs the
 * certificate's SPKI separately from its full DER, so this extracts it locally — see
 * {@link extractSubjectPublicKeyInfo}.
 */
export function createTrustedCertificateVerifier(
  certificateFile: Uint8Array,
): Result<ResponseSignatureVerifier, LoadVerifierError> {
  try {
    const certificateDer = decodeCertificateFile(certificateFile);
    const spki = extractSubjectPublicKeyInfo(certificateDer);
    return ok(createCryptoKeyResponseSignatureVerifier(spki, certificateDer));
  } catch (cause) {
    return err({ message: describeError(cause) });
  }
}

/** SHA-256 fingerprint of `data`, formatted as lowercase colon-separated hex (`aa:bb:...`). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(":");
}

const PEM_BLOCK_PATTERN = /-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/;

/** Accepts either raw DER bytes or a PEM-encoded file and returns the decoded DER bytes. */
function decodeCertificateFile(bytes: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(bytes);
  const match = PEM_BLOCK_PATTERN.exec(text);
  const base64 = match?.[1];
  if (base64 === undefined) return bytes;
  const binary = atob(base64.replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

interface DerTlv {
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly end: number;
}

/**
 * Minimal DER tag-length-value reader, scoped to exactly one job: walking past the leading fields
 * of an X.509 `TBSCertificate` (RFC 5280 §4.1) to reach `subjectPublicKeyInfo`. This does not
 * import the SDK's own DER reader (`src/pkcs12/der.ts`) — that module is a private implementation
 * detail of the `pkcs12` subpath, not exported from it, so not part of the SDK's public API.
 */
function readDerTlv(bytes: Uint8Array, offset: number): DerTlv {
  const first = bytes[offset];
  if (first === undefined) throw new Error("Unexpected end of DER data.");
  let pos = offset + 1;
  const lengthByte = bytes[pos];
  if (lengthByte === undefined) throw new Error("Truncated DER length.");
  pos++;
  let length: number;
  if ((lengthByte & 0x80) === 0) {
    length = lengthByte;
  } else {
    const numBytes = lengthByte & 0x7f;
    if (numBytes === 0 || numBytes > 4) throw new Error("Unsupported DER length encoding.");
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      const byte = bytes[pos];
      if (byte === undefined) throw new Error("Truncated DER length.");
      length = length * 256 + byte;
      pos++;
    }
  }
  const contentStart = pos;
  const contentEnd = contentStart + length;
  if (contentEnd > bytes.length) throw new Error("DER length extends past the available data.");
  return { contentStart, contentEnd, end: contentEnd };
}

const EXPLICIT_VERSION_TAG = 0xa0;

/**
 * Extracts the DER-encoded `SubjectPublicKeyInfo` from a full X.509 `Certificate` DER:
 * `Certificate ::= SEQUENCE { tbsCertificate TBSCertificate, ... }`, and `TBSCertificate ::=
 * SEQUENCE { version [0] EXPLICIT Version DEFAULT v1, serialNumber, signature, issuer, validity,
 * subject, subjectPublicKeyInfo, ... }`. `version` is walked past by position (its explicit
 * context tag `0xa0` is checked, not its content), since every modern certificate is v3 and
 * carries it.
 */
export function extractSubjectPublicKeyInfo(certificateDer: Uint8Array): Uint8Array {
  const certificate = readDerTlv(certificateDer, 0);
  const tbsCertificate = readDerTlv(certificateDer, certificate.contentStart);

  const afterVersion =
    certificateDer[tbsCertificate.contentStart] === EXPLICIT_VERSION_TAG
      ? readDerTlv(certificateDer, tbsCertificate.contentStart).end
      : tbsCertificate.contentStart;

  const serialNumber = readDerTlv(certificateDer, afterVersion);
  const signatureAlgorithm = readDerTlv(certificateDer, serialNumber.end);
  const issuer = readDerTlv(certificateDer, signatureAlgorithm.end);
  const validity = readDerTlv(certificateDer, issuer.end);
  const subject = readDerTlv(certificateDer, validity.end);
  const subjectPublicKeyInfo = readDerTlv(certificateDer, subject.end);

  return certificateDer.slice(subject.end, subjectPublicKeyInfo.end);
}
