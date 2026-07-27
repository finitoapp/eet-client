/**
 * Parses a PKCS#12 (`.p12`/PFX) file — RFC 7292 — into its raw DER certificates and private key,
 * entirely in pure JS/Web Crypto: no Node `crypto`/`tls`, no native/WASM dependency, works
 * identically in Node, Bun, Deno, and the browser. Exists because this SDK's own signer only ever
 * wants a DER certificate + a `CryptoKey` (see `core/crypto-adapters.ts`) — turning a real-world
 * `.p12` into those two things has historically meant shelling out to `openssl` (see this repo's
 * README and `test/integration/p12-helper.ts`), which browsers can't do at all.
 *
 * Scope, deliberately: only "password privacy mode" + "password integrity mode" (the universal
 * case for cash-register certificates) — no public-key privacy/integrity mode (enveloped data,
 * signed `authSafe`). Only the algorithms actually observed in real GFŘ-issued playground
 * certificates are implemented: `pbeWithSHA1And40BitRC2-CBC` / `pbeWithSHA1And128BitRC2-CBC` for
 * certificate `SafeContents`, `pbeWithSHA1And{2,3}-KeyTripleDES-CBC` for the private key's
 * `PKCS8ShroudedKeyBag`, SHA-1 `MacData`. Anything else surfaces as `Pkcs12MalformedError` with
 * the offending OID rather than silently misbehaving.
 */
import { bytesEqual, constantTimeEqual } from "../core/bytes.ts";
import { type Result, tryAsync } from "../result.ts";
import {
  contentBytes,
  DER_TAG,
  type DerNode,
  expectChild,
  expectTag,
  fullBytes,
  readBmpString,
  readChildren,
  readExplicit,
  readInteger,
  readObjectIdentifier,
  readTlv,
} from "./der.ts";
import { tripleDesCbcDecrypt } from "./des.ts";
import {
  createPkcs12InvalidMacError,
  createPkcs12MalformedError,
  isPkcs12Error,
  type Pkcs12Error,
} from "./errors.ts";
import { derivePkcs12Bits, PKCS12_KDF_ID } from "./kdf.ts";
import { rc2CbcDecrypt } from "./rc2.ts";

const OID = {
  pkcs7Data: "1.2.840.113549.1.7.1",
  pkcs7EncryptedData: "1.2.840.113549.1.7.6",
  certBag: "1.2.840.113549.1.12.10.1.3",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  pkcs8ShroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  x509Certificate: "1.2.840.113549.1.9.22.1",
  friendlyName: "1.2.840.113549.1.9.20",
  localKeyId: "1.2.840.113549.1.9.21",
  sha1: "1.3.14.3.2.26",
  pbeShaAnd128BitRc2Cbc: "1.2.840.113549.1.12.1.5",
  pbeShaAnd40BitRc2Cbc: "1.2.840.113549.1.12.1.6",
  pbeShaAnd2KeyTripleDesCbc: "1.2.840.113549.1.12.1.4",
  pbeShaAnd3KeyTripleDesCbc: "1.2.840.113549.1.12.1.3",
} as const;

/** One certificate extracted from a `.p12` file, in the order it appeared (typically leaf, then chain upward). */
export interface Pkcs12Certificate {
  readonly der: Uint8Array;
  readonly localKeyId?: Uint8Array;
  readonly friendlyName?: string;
}

/** A private key extracted from a `.p12` file, as a PKCS#8 `PrivateKeyInfo` DER — importable via `crypto.subtle.importKey("pkcs8", ...)`. */
export interface Pkcs12PrivateKey {
  readonly der: Uint8Array;
  readonly localKeyId?: Uint8Array;
}

export interface Pkcs12Contents {
  readonly certificates: ReadonlyArray<Pkcs12Certificate>;
  readonly privateKey: Pkcs12PrivateKey | undefined;
}

/**
 * Picks the certificate matching `privateKey`'s `localKeyId` — the standard way a `.p12`
 * associates one certificate out of a chain with the private key. Falls back to the first
 * certificate only when there's genuinely nothing to compare (either side has no `localKeyId`,
 * which is common for single-certificate files) — if `privateKey` *does* have a `localKeyId` but
 * it doesn't match any certificate's, that's a real mismatch (a corrupted file, or bags from
 * unrelated key/cert pairs), so this returns `undefined` rather than guessing wrong.
 */
export function pickPrivateKeyCertificate(contents: Pkcs12Contents): Pkcs12Certificate | undefined {
  const { certificates, privateKey } = contents;
  const keyId = privateKey?.localKeyId;
  if (keyId === undefined) return certificates[0];
  return certificates.find(
    (cert) => cert.localKeyId !== undefined && bytesEqual(cert.localKeyId, keyId),
  );
}

function pkcs5Unpad(padded: Uint8Array, blockSize: number): Uint8Array {
  const padLength = padded[padded.length - 1];
  if (
    padLength === undefined ||
    padLength < 1 ||
    padLength > blockSize ||
    padLength > padded.length
  ) {
    throw new Error("Invalid PKCS#5 padding (wrong password, or corrupted data).");
  }
  for (let i = padded.length - padLength; i < padded.length; i++) {
    if (padded[i] !== padLength)
      throw new Error("Invalid PKCS#5 padding (wrong password, or corrupted data).");
  }
  return padded.subarray(0, padded.length - padLength);
}

/** `ContentInfo ::= SEQUENCE { contentType OID, [0] EXPLICIT content }` — used for both `PFX.authSafe` and each element of `AuthenticatedSafe`. */
function readContentInfo(bytes: Uint8Array, node: DerNode): { oid: string; content: DerNode } {
  const children = readChildren(bytes, node.contentStart, node.contentEnd);
  const oid = readObjectIdentifier(bytes, expectChild(children, 0, DER_TAG.objectIdentifier));
  const wrapper = children[1];
  if (wrapper === undefined) throw new Error("ContentInfo is missing its [0] EXPLICIT content.");
  const content = readExplicit(bytes, wrapper, 0);
  return { oid, content };
}

/** `AlgorithmIdentifier ::= SEQUENCE { algorithm OID, parameters PKCS12PBEParams }`, `PKCS12PBEParams ::= SEQUENCE { salt OCTET STRING, iterations INTEGER }`. */
function readPbeAlgorithm(
  bytes: Uint8Array,
  node: DerNode,
): { oid: string; salt: Uint8Array; iterations: number } {
  const children = readChildren(bytes, node.contentStart, node.contentEnd);
  const oid = readObjectIdentifier(bytes, expectChild(children, 0, DER_TAG.objectIdentifier));
  const paramsNode = children[1];
  if (paramsNode === undefined)
    throw new Error(`PBE AlgorithmIdentifier for "${oid}" is missing its parameters.`);
  const paramsChildren = readChildren(bytes, paramsNode.contentStart, paramsNode.contentEnd);
  const salt = contentBytes(bytes, expectChild(paramsChildren, 0, DER_TAG.octetString));
  const iterations = Number(readInteger(bytes, expectChild(paramsChildren, 1, DER_TAG.integer)));
  return { oid, salt, iterations };
}

async function decryptPbe(
  password: string,
  oid: string,
  salt: Uint8Array,
  iterations: number,
  encrypted: Uint8Array,
): Promise<Uint8Array> {
  switch (oid) {
    case OID.pbeShaAnd40BitRc2Cbc:
    case OID.pbeShaAnd128BitRc2Cbc: {
      const effectiveKeyBits = oid === OID.pbeShaAnd40BitRc2Cbc ? 40 : 128;
      const keyLength = effectiveKeyBits / 8;
      const [key, iv] = await Promise.all([
        derivePkcs12Bits(password, salt, iterations, PKCS12_KDF_ID.key, keyLength),
        derivePkcs12Bits(password, salt, iterations, PKCS12_KDF_ID.iv, 8),
      ]);
      return pkcs5Unpad(rc2CbcDecrypt(key, effectiveKeyBits, iv, encrypted), 8);
    }
    case OID.pbeShaAnd2KeyTripleDesCbc:
    case OID.pbeShaAnd3KeyTripleDesCbc: {
      const keyLength = oid === OID.pbeShaAnd2KeyTripleDesCbc ? 16 : 24;
      const [key, iv] = await Promise.all([
        derivePkcs12Bits(password, salt, iterations, PKCS12_KDF_ID.key, keyLength),
        derivePkcs12Bits(password, salt, iterations, PKCS12_KDF_ID.iv, 8),
      ]);
      return pkcs5Unpad(tripleDesCbcDecrypt(key, iv, encrypted), 8);
    }
    default:
      throw new Error(`Unsupported PKCS#12 encryption algorithm OID "${oid}".`);
  }
}

interface CollectedBags {
  readonly certificates: Pkcs12Certificate[];
  privateKey: Pkcs12PrivateKey | undefined;
}

/** Reads an optional `bagAttributes ::= SET OF PKCS12Attribute`, extracting `friendlyName`/`localKeyId` if present. */
function readBagAttributes(
  bytes: Uint8Array,
  node: DerNode | undefined,
): { friendlyName?: string; localKeyId?: Uint8Array } {
  if (node === undefined) return {};
  const attributes = readChildren(bytes, node.contentStart, node.contentEnd);
  let friendlyName: string | undefined;
  let localKeyId: Uint8Array | undefined;
  for (const attribute of attributes) {
    const attrChildren = readChildren(bytes, attribute.contentStart, attribute.contentEnd);
    const attrOid = readObjectIdentifier(
      bytes,
      expectChild(attrChildren, 0, DER_TAG.objectIdentifier),
    );
    const valuesSet = attrChildren[1];
    if (valuesSet === undefined) continue;
    const values = readChildren(bytes, valuesSet.contentStart, valuesSet.contentEnd);
    const firstValue = values[0];
    if (firstValue === undefined) continue;
    if (attrOid === OID.friendlyName) friendlyName = readBmpString(bytes, firstValue);
    else if (attrOid === OID.localKeyId) localKeyId = contentBytes(bytes, firstValue);
  }
  const result: { friendlyName?: string; localKeyId?: Uint8Array } = {};
  if (friendlyName !== undefined) result.friendlyName = friendlyName;
  if (localKeyId !== undefined) result.localKeyId = localKeyId;
  return result;
}

/** Parses+decrypts a `PKCS8ShroudedKeyBag`'s `EncryptedPrivateKeyInfo` into a plain PKCS#8 `PrivateKeyInfo` DER. */
async function decryptShroudedKeyBag(
  password: string,
  safeContentsBytes: Uint8Array,
  bagValue: DerNode,
): Promise<Uint8Array> {
  const children = readChildren(safeContentsBytes, bagValue.contentStart, bagValue.contentEnd);
  const algorithm = expectChild(children, 0, DER_TAG.sequence);
  const encryptedData = contentBytes(
    safeContentsBytes,
    expectChild(children, 1, DER_TAG.octetString),
  );
  const { oid, salt, iterations } = readPbeAlgorithm(safeContentsBytes, algorithm);
  return decryptPbe(password, oid, salt, iterations, encryptedData);
}

/** Parses `SafeContents ::= SEQUENCE OF SafeBag` (already-decrypted plaintext) and collects certs/keys into `into`. */
async function collectSafeBags(
  password: string,
  safeContentsBytes: Uint8Array,
  into: CollectedBags,
): Promise<void> {
  const root = readTlv(safeContentsBytes, 0);
  expectTag(root, DER_TAG.sequence, { constructed: true });
  const bags = readChildren(safeContentsBytes, root.contentStart, root.contentEnd);

  for (const bag of bags) {
    const bagChildren = readChildren(safeContentsBytes, bag.contentStart, bag.contentEnd);
    const bagId = readObjectIdentifier(
      safeContentsBytes,
      expectChild(bagChildren, 0, DER_TAG.objectIdentifier),
    );
    const bagValueWrapper = bagChildren[1];
    if (bagValueWrapper === undefined)
      throw new Error(`SafeBag "${bagId}" is missing its bagValue.`);
    const bagValue = readExplicit(safeContentsBytes, bagValueWrapper, 0);
    const attributes = readBagAttributes(safeContentsBytes, bagChildren[2]);

    if (bagId === OID.certBag) {
      const certBagChildren = readChildren(
        safeContentsBytes,
        bagValue.contentStart,
        bagValue.contentEnd,
      );
      const certType = readObjectIdentifier(
        safeContentsBytes,
        expectChild(certBagChildren, 0, DER_TAG.objectIdentifier),
      );
      if (certType !== OID.x509Certificate) {
        throw new Error(
          `Unsupported CertBag certificate type OID "${certType}" (only X.509 is supported).`,
        );
      }
      const certValueWrapper = certBagChildren[1];
      if (certValueWrapper === undefined) throw new Error("CertBag is missing its certValue.");
      const certOctet = readExplicit(safeContentsBytes, certValueWrapper, 0);
      into.certificates.push({ der: contentBytes(safeContentsBytes, certOctet), ...attributes });
    } else if (bagId === OID.keyBag) {
      into.privateKey = { der: fullBytes(safeContentsBytes, bagValue), ...attributes };
    } else if (bagId === OID.pkcs8ShroudedKeyBag) {
      const der = await decryptShroudedKeyBag(password, safeContentsBytes, bagValue);
      into.privateKey = { der, ...attributes };
    } else {
      throw new Error(
        `Unsupported SafeBag type OID "${bagId}" (only cert/key bags are supported).`,
      );
    }
  }
}

async function parsePkcs12Unsafe(data: Uint8Array, password: string): Promise<Pkcs12Contents> {
  const root = readTlv(data, 0);
  expectTag(root, DER_TAG.sequence, { constructed: true });
  const topLevel = readChildren(data, root.contentStart, root.contentEnd);

  const versionNode = expectChild(topLevel, 0, DER_TAG.integer);
  const version = readInteger(data, versionNode);
  if (version !== 3n)
    throw new Error(`Unsupported PFX version ${version} (only version 3 is supported).`);

  const authSafeContentInfo = expectChild(topLevel, 1, DER_TAG.sequence);
  const { oid: authSafeOid, content: authSafeOctet } = readContentInfo(data, authSafeContentInfo);
  if (authSafeOid !== OID.pkcs7Data) {
    throw new Error(
      `Unsupported PFX authSafe contentType "${authSafeOid}" (only password-integrity "data" mode is supported, not signed/public-key integrity).`,
    );
  }
  const authSafeBytes = contentBytes(data, authSafeOctet);

  const macDataNode = topLevel[2];
  if (macDataNode === undefined) {
    throw new Error(
      "PFX has no MacData — password-less/public-key integrity mode is not supported.",
    );
  }
  const macChildren = readChildren(data, macDataNode.contentStart, macDataNode.contentEnd);
  const digestInfo = expectChild(macChildren, 0, DER_TAG.sequence);
  const digestInfoChildren = readChildren(data, digestInfo.contentStart, digestInfo.contentEnd);
  const digestAlgorithm = expectChild(digestInfoChildren, 0, DER_TAG.sequence);
  const digestOid = readObjectIdentifier(
    data,
    expectChild(
      readChildren(data, digestAlgorithm.contentStart, digestAlgorithm.contentEnd),
      0,
      DER_TAG.objectIdentifier,
    ),
  );
  if (digestOid !== OID.sha1) {
    throw new Error(
      `Unsupported MacData digest algorithm OID "${digestOid}" (only SHA-1 is supported).`,
    );
  }
  const expectedMac = contentBytes(data, expectChild(digestInfoChildren, 1, DER_TAG.octetString));
  const macSalt = contentBytes(data, expectChild(macChildren, 1, DER_TAG.octetString));
  const iterationsNode = macChildren[2];
  const macIterations =
    iterationsNode === undefined ? 1 : Number(readInteger(data, iterationsNode));

  const macKey = await derivePkcs12Bits(password, macSalt, macIterations, PKCS12_KDF_ID.mac, 20);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    macKey as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const actualMac = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, authSafeBytes as BufferSource),
  );
  if (!constantTimeEqual(actualMac, expectedMac)) {
    throw createPkcs12InvalidMacError({
      message: "PKCS#12 MAC verification failed (wrong password, or corrupted file).",
    });
  }

  const authSafeRoot = readTlv(authSafeBytes, 0);
  expectTag(authSafeRoot, DER_TAG.sequence, { constructed: true });
  const contentInfos = readChildren(
    authSafeBytes,
    authSafeRoot.contentStart,
    authSafeRoot.contentEnd,
  );

  const collected: CollectedBags = { certificates: [], privateKey: undefined };
  for (const contentInfoNode of contentInfos) {
    const { oid, content } = readContentInfo(authSafeBytes, contentInfoNode);

    let safeContentsBytes: Uint8Array;
    if (oid === OID.pkcs7Data) {
      safeContentsBytes = contentBytes(authSafeBytes, content);
    } else if (oid === OID.pkcs7EncryptedData) {
      const encryptedDataChildren = readChildren(
        authSafeBytes,
        content.contentStart,
        content.contentEnd,
      );
      const encryptedContentInfo = expectChild(encryptedDataChildren, 1, DER_TAG.sequence);
      const eciChildren = readChildren(
        authSafeBytes,
        encryptedContentInfo.contentStart,
        encryptedContentInfo.contentEnd,
      );
      const algorithm = expectChild(eciChildren, 1, DER_TAG.sequence);
      const encryptedContentNode = eciChildren[2];
      if (encryptedContentNode === undefined) {
        throw new Error("EncryptedContentInfo has no encryptedContent.");
      }
      const encryptedContent = contentBytes(authSafeBytes, encryptedContentNode);
      const { oid: algOid, salt, iterations } = readPbeAlgorithm(authSafeBytes, algorithm);
      safeContentsBytes = await decryptPbe(password, algOid, salt, iterations, encryptedContent);
    } else {
      throw new Error(`Unsupported AuthenticatedSafe ContentInfo type "${oid}".`);
    }

    await collectSafeBags(password, safeContentsBytes, collected);
  }

  return { certificates: collected.certificates, privateKey: collected.privateKey };
}

/**
 * Parses a PKCS#12 (`.p12`) buffer into its DER certificates and private key. See the module
 * doc comment for exactly which shapes/algorithms are supported; anything else, or a wrong
 * `password`, resolves to `Err`.
 */
export async function parsePkcs12(
  data: Uint8Array,
  password: string,
): Promise<Result<Pkcs12Contents, Pkcs12Error>> {
  return tryAsync(
    () => parsePkcs12Unsafe(data, password),
    (cause): Pkcs12Error =>
      isPkcs12Error(cause, "Pkcs12InvalidMacError")
        ? cause
        : createPkcs12MalformedError({
            message: cause instanceof Error ? cause.message : "Failed to parse PKCS#12 data.",
            cause,
          }),
  );
}
