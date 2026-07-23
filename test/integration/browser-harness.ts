import { parseEetReceiptData } from "../../src/builtin/index.ts";
import { createEetClient } from "../../src/client.ts";
import { decodeBase64 } from "../../src/core/base64.ts";
import { generateEetDateTime } from "../../src/core/generate.ts";
import { getOrThrow } from "../../src/result.ts";
import { EetEndpoint } from "../../src/types/client.ts";
import type { EetSigner } from "../../src/types/signer.ts";
import type { EetParsedSignature, ResponseSignatureVerifier } from "../../src/types/verifier.ts";

/**
 * Bundled via `Bun.build({ target: "browser" })` by `browser-live-playground.test.ts` and
 * injected into a real Chromium tab, so this whole module — signing, `fetch`, response parsing,
 * and signature verification — executes inside actual browser JavaScript, not Bun/Node.
 * Assigns its entry point to `globalThis` because an inline `<script type="module">` has no
 * importable specifier for `page.evaluate` to reach.
 */

const RSA_SHA256: RsaHashedImportParams = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

interface Tlv {
  readonly tag: number;
  readonly start: number;
  readonly contentStart: number;
  readonly contentEnd: number;
}

/** Reads one DER tag-length-value header at `offset` (definite-length form only, as X.509 always uses). */
function readTlv(bytes: Uint8Array, offset: number): Tlv {
  const tag = bytes[offset];
  const firstLengthByte = bytes[offset + 1];
  if (tag === undefined || firstLengthByte === undefined) {
    throw new Error("DER: unexpected end of input reading a tag/length.");
  }
  let contentStart = offset + 2;
  let length: number;
  if ((firstLengthByte & 0x80) === 0) {
    length = firstLengthByte;
  } else {
    const numLengthBytes = firstLengthByte & 0x7f;
    length = 0;
    for (let i = 0; i < numLengthBytes; i++) {
      const byte = bytes[contentStart + i];
      if (byte === undefined)
        throw new Error("DER: unexpected end of input reading a long-form length.");
      length = (length << 8) | byte;
    }
    contentStart += numLengthBytes;
  }
  return { tag, start: offset, contentStart, contentEnd: contentStart + length };
}

function readChildren(bytes: Uint8Array, contentStart: number, contentEnd: number): Tlv[] {
  const children: Tlv[] = [];
  let offset = contentStart;
  while (offset < contentEnd) {
    const child = readTlv(bytes, offset);
    children.push(child);
    offset = child.contentEnd;
  }
  return children;
}

const CONSTRUCTED_TAG_MASK = 0x20;
// UTF8String, PrintableString, IA5String, TeletexString — the DirectoryString variants any real CA uses.
const DER_STRING_TAGS = new Set([0x0c, 0x13, 0x16, 0x14]);

function collectStrings(bytes: Uint8Array, tlv: Tlv, out: string[]): void {
  if (DER_STRING_TAGS.has(tlv.tag)) {
    out.push(new TextDecoder().decode(bytes.subarray(tlv.contentStart, tlv.contentEnd)));
    return;
  }
  if ((tlv.tag & CONSTRUCTED_TAG_MASK) !== 0) {
    for (const child of readChildren(bytes, tlv.contentStart, tlv.contentEnd)) {
      collectStrings(bytes, child, out);
    }
  }
}

const CONTEXT_TAG_VERSION = 0xa0;
// Fixed tbsCertificate field order per RFC 5280 (version is the only optional field before this point).
const TBS_FIELD_OFFSET_ISSUER = 2;
const TBS_FIELD_OFFSET_SUBJECT_PUBLIC_KEY_INFO = 5;

/**
 * Extracts the SubjectPublicKeyInfo DER blob (importable as-is via `crypto.subtle.importKey`)
 * and a best-effort, human-readable issuer string from a raw X.509v3 certificate — a minimal,
 * browser-portable stand-in for `node:crypto`'s `X509Certificate`, which does not exist in
 * browsers. Deliberately does not validate the certificate chain (neither does the Node
 * equivalent this test mirrors); it only locates the two substructures needed to check who
 * issued the leaf certificate and whether its signature is authentic.
 */
function parseCertificate(certificateDer: Uint8Array): {
  subjectPublicKeyInfoDer: Uint8Array;
  issuerText: string;
} {
  const certificate = readTlv(certificateDer, 0);
  const [tbsCertificate] = readChildren(
    certificateDer,
    certificate.contentStart,
    certificate.contentEnd,
  );
  if (tbsCertificate === undefined) throw new Error("DER: missing tbsCertificate.");

  const tbsChildren = readChildren(
    certificateDer,
    tbsCertificate.contentStart,
    tbsCertificate.contentEnd,
  );
  const versionPresent = tbsChildren[0]?.tag === CONTEXT_TAG_VERSION;
  const base = versionPresent ? 1 : 0;
  const issuer = tbsChildren[base + TBS_FIELD_OFFSET_ISSUER];
  const subjectPublicKeyInfo = tbsChildren[base + TBS_FIELD_OFFSET_SUBJECT_PUBLIC_KEY_INFO];
  if (issuer === undefined || subjectPublicKeyInfo === undefined) {
    throw new Error("DER: tbsCertificate does not have the expected RFC 5280 field layout.");
  }

  const issuerStrings: string[] = [];
  collectStrings(certificateDer, issuer, issuerStrings);

  return {
    subjectPublicKeyInfoDer: certificateDer.subarray(
      subjectPublicKeyInfo.start,
      subjectPublicKeyInfo.contentEnd,
    ),
    issuerText: issuerStrings.join(", "),
  };
}

/** Browser-portable equivalent of `trustingButUnchainedVerifier` in `live-playground.test.ts`. */
const browserVerifier: ResponseSignatureVerifier = {
  async verify({ signature }: { signature: EetParsedSignature }) {
    const leafDer = signature.certificates[0];
    if (leafDer === undefined) return false;

    const { subjectPublicKeyInfoDer, issuerText } = parseCertificate(leafDer);
    if (!issuerText.includes("I.CA")) return false; // sanity check only, not chain validation

    const publicKey = await crypto.subtle.importKey(
      "spki",
      subjectPublicKeyInfoDer as BufferSource,
      RSA_SHA256,
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      RSA_SHA256.name,
      publicKey,
      signature.signatureValue as BufferSource,
      signature.signedInfoCanonical as BufferSource,
    );
  },
};

async function runEetBrowserSubmit(
  certificateDerBase64: string,
  keyDerBase64: string,
): Promise<unknown> {
  const certificateDer = decodeBase64(certificateDerBase64);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    decodeBase64(keyDerBase64) as BufferSource,
    RSA_SHA256,
    false,
    ["sign"],
  );
  const signer: EetSigner = {
    getCertificate: () => certificateDer,
    sign: async (data) =>
      new Uint8Array(await crypto.subtle.sign(RSA_SHA256.name, privateKey, data as BufferSource)),
  };

  const client = createEetClient({
    endpoint: EetEndpoint.playground,
    signer,
    responseSignatureVerifier: browserVerifier,
    // A real browser's `fetch` is a branded method that throws "Illegal invocation" when called
    // detached from `window` — which is exactly how the SDK's default (`options.fetch ?? fetch`,
    // captured once at module scope) would call it. Passing it bound is the caller-side fix the
    // SDK already supports via `EetClientOptions.fetch`, not a browser-only special case.
    fetch: window.fetch.bind(window),
    timeoutMs: 15_000,
  });

  const receipt = getOrThrow(
    parseEetReceiptData({
      eic_popl: "CZ8551015704",
      id_jednotky: "24",
      id_pokl: "sdk-browser-test",
      porad_cis: `run-${Date.now()}`,
      dat_trzby: generateEetDateTime(),
      celk_trzba: "1.00",
    }),
  );

  return getOrThrow(await client.submit(receipt, { firstSubmission: true }));
}

(
  globalThis as unknown as { __runEetBrowserSubmit: typeof runEetBrowserSubmit }
).__runEetBrowserSubmit = runEetBrowserSubmit;
