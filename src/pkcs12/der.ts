/**
 * Minimal BER/DER tag-length-value reader, scoped to exactly what parsing a PKCS#12 (PFX)
 * structure needs: SEQUENCE/SET traversal, OBJECT IDENTIFIER, INTEGER, and opaque OCTET
 * STRING/context-tag content slices. Not a general-purpose ASN.1 library (no encoder, no
 * BIT STRING/UTCTime/etc. decoding) — only decoding, since every DER-encoded blob this module
 * cares about (certificates, PKCS#8 keys) is passed through verbatim, never re-encoded.
 */
import { at } from "../core/bytes.ts";

/** Universal class DER tag numbers used while walking a PKCS#12 structure. */
export const DER_TAG = {
  integer: 0x02,
  octetString: 0x04,
  null: 0x05,
  objectIdentifier: 0x06,
  utf8String: 0x0c,
  sequence: 0x10,
  set: 0x11,
  bmpString: 0x1e,
} as const;

/** One decoded tag-length-value header, with `start`/`end` spanning the *entire* TLV (tag+length+content). */
export interface DerNode {
  readonly tagClass: number;
  readonly constructed: boolean;
  readonly tag: number;
  readonly start: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly end: number;
}

/** Reads a single TLV header (and implicitly its content range) starting at `offset`. */
export function readTlv(bytes: Uint8Array, offset: number): DerNode {
  const first = at(bytes, offset);
  const tagClass = (first >> 6) & 0x03;
  const constructed = (first & 0x20) !== 0;
  let tag = first & 0x1f;
  let pos = offset + 1;

  if (tag === 0x1f) {
    tag = 0;
    let more = true;
    while (more) {
      const b = at(bytes, pos);
      pos++;
      tag = tag * 128 + (b & 0x7f);
      more = (b & 0x80) !== 0;
    }
  }

  const lengthByte = at(bytes, pos);
  pos++;
  let length: number;
  if ((lengthByte & 0x80) === 0) {
    length = lengthByte;
  } else {
    const numBytes = lengthByte & 0x7f;
    if (numBytes === 0) throw new Error("Indefinite-length DER encoding is not supported.");
    if (numBytes > 4) throw new Error("DER length field is too large to represent.");
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = length * 256 + at(bytes, pos);
      pos++;
    }
  }

  const contentStart = pos;
  const contentEnd = contentStart + length;
  if (contentEnd > bytes.length) {
    throw new Error("DER length extends past the end of the available data.");
  }
  return { tagClass, constructed, tag, start: offset, contentStart, contentEnd, end: contentEnd };
}

/** Reads consecutive sibling TLVs filling exactly `[start, end)` (e.g. the members of a SEQUENCE/SET). */
export function readChildren(bytes: Uint8Array, start: number, end: number): DerNode[] {
  const nodes: DerNode[] = [];
  let pos = start;
  while (pos < end) {
    const node = readTlv(bytes, pos);
    nodes.push(node);
    pos = node.end;
  }
  if (pos !== end) throw new Error("DER child element overruns its container's length.");
  return nodes;
}

function requireNode(nodes: ReadonlyArray<DerNode>, index: number, what: string): DerNode {
  const node = nodes[index];
  if (node === undefined) throw new Error(`Expected ${what} at index ${index}, found none.`);
  return node;
}

/** Asserts `node` has the given universal tag and (for constructed types) constructed bit, then returns it. */
export function expectTag(
  node: DerNode,
  tag: number,
  options?: { readonly constructed?: boolean },
): DerNode {
  if (node.tagClass !== 0 || node.tag !== tag) {
    throw new Error(
      `Expected universal DER tag ${tag}, got class ${node.tagClass} tag ${node.tag}.`,
    );
  }
  if (options?.constructed !== undefined && node.constructed !== options.constructed) {
    throw new Error(`DER tag ${tag} has unexpected constructed bit ${String(node.constructed)}.`);
  }
  return node;
}

/** `requireNode` + `expectTag`, for the common case of reading the Nth child of a known-shape SEQUENCE. */
export function expectChild(
  nodes: ReadonlyArray<DerNode>,
  index: number,
  tag: number,
  options?: { readonly constructed?: boolean },
): DerNode {
  return expectTag(requireNode(nodes, index, `DER tag ${tag}`), tag, options);
}

/** Decodes an OBJECT IDENTIFIER's content into dotted-decimal form (e.g. `"1.2.840.113549.1.7.1"`). */
export function readObjectIdentifier(bytes: Uint8Array, node: DerNode): string {
  expectTag(node, DER_TAG.objectIdentifier, { constructed: false });
  if (node.contentEnd === node.contentStart) throw new Error("Empty OBJECT IDENTIFIER.");

  const arcs: number[] = [];
  let value = 0;
  let lastByteContinues = false;
  for (let i = node.contentStart; i < node.contentEnd; i++) {
    const b = at(bytes, i);
    value = value * 128 + (b & 0x7f);
    lastByteContinues = (b & 0x80) !== 0;
    if (!lastByteContinues) {
      arcs.push(value);
      value = 0;
    }
  }
  if (lastByteContinues) {
    throw new Error("Truncated OBJECT IDENTIFIER: final sub-identifier is incomplete.");
  }
  const first = arcs[0];
  if (first === undefined) throw new Error("OBJECT IDENTIFIER decoded to zero arcs.");
  const head = first < 80 ? [Math.floor(first / 40), first % 40] : [2, first - 80];
  return [...head, ...arcs.slice(1)].join(".");
}

/** Decodes an INTEGER's content as a `bigint` (arbitrary size; DER integers are signed, big-endian, minimal). */
export function readInteger(bytes: Uint8Array, node: DerNode): bigint {
  expectTag(node, DER_TAG.integer, { constructed: false });
  if (node.contentEnd === node.contentStart) throw new Error("Empty INTEGER.");
  const first = at(bytes, node.contentStart);
  let value = BigInt(first & 0x80 ? first - 256 : first);
  for (let i = node.contentStart + 1; i < node.contentEnd; i++) {
    value = value * 256n + BigInt(at(bytes, i));
  }
  return value;
}

/** Returns a fresh copy of `node`'s content octets (e.g. the raw bytes of an OCTET STRING). */
export function contentBytes(bytes: Uint8Array, node: DerNode): Uint8Array {
  return bytes.slice(node.contentStart, node.contentEnd);
}

/** Returns a fresh copy of `node`'s full encoding (tag + length + content) — needed for values that are re-used as-is (e.g. an unencrypted PrivateKeyInfo). */
export function fullBytes(bytes: Uint8Array, node: DerNode): Uint8Array {
  return bytes.slice(node.start, node.end);
}

/**
 * Reads an `[N] EXPLICIT` context-tagged wrapper and returns its single inner TLV — the standard
 * shape for `ContentInfo.content`, `SafeBag.bagValue`, and `CertBag.certValue` in PKCS#7/#12.
 */
export function readExplicit(bytes: Uint8Array, node: DerNode, expectedTag: number): DerNode {
  if (node.tagClass !== 2 || node.tag !== expectedTag || !node.constructed) {
    throw new Error(
      `Expected an EXPLICIT [${expectedTag}] context tag, got class ${node.tagClass} tag ${node.tag}.`,
    );
  }
  const children = readChildren(bytes, node.contentStart, node.contentEnd);
  return requireNode(children, 0, `EXPLICIT [${expectedTag}] content`);
}

/** Decodes a BMPString's (UTF-16BE) content into a JS string — used only for informational `friendlyName` bag attributes. */
export function readBmpString(bytes: Uint8Array, node: DerNode): string {
  expectTag(node, DER_TAG.bmpString, { constructed: false });
  const length = node.contentEnd - node.contentStart;
  if (length % 2 !== 0) throw new Error("BMPString content has an odd byte length.");
  const codeUnits: number[] = [];
  for (let i = node.contentStart; i < node.contentEnd; i += 2) {
    codeUnits.push((at(bytes, i) << 8) | at(bytes, i + 1));
  }
  return String.fromCharCode(...codeUnits);
}
