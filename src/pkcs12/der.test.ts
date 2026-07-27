import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  contentBytes,
  DER_TAG,
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

describe("readTlv", () => {
  test("reads a short-form length primitive tag", () => {
    const bytes = new Uint8Array([0x04, 0x03, 0xaa, 0xbb, 0xcc]);
    const node = readTlv(bytes, 0);
    assert.strictEqual(node.tagClass, 0);
    assert.strictEqual(node.constructed, false);
    assert.strictEqual(node.tag, DER_TAG.octetString);
    assert.strictEqual(node.start, 0);
    assert.strictEqual(node.contentStart, 2);
    assert.strictEqual(node.contentEnd, 5);
    assert.strictEqual(node.end, 5);
  });

  test("reads a long-form (multi-byte) length", () => {
    const content = new Uint8Array(300).fill(0x01);
    const bytes = new Uint8Array([0x04, 0x82, 0x01, 0x2c, ...content]);
    const node = readTlv(bytes, 0);
    assert.strictEqual(node.contentEnd - node.contentStart, 300);
    assert.strictEqual(node.end, bytes.length);
  });

  test("reads a constructed context tag", () => {
    const bytes = new Uint8Array([0xa0, 0x02, 0x05, 0x00]);
    const node = readTlv(bytes, 0);
    assert.strictEqual(node.tagClass, 2);
    assert.strictEqual(node.constructed, true);
    assert.strictEqual(node.tag, 0);
  });

  test("throws on indefinite-length encoding", () => {
    const bytes = new Uint8Array([0x30, 0x80, 0x00, 0x00]);
    assert.throws(() => readTlv(bytes, 0), /[Ii]ndefinite/);
  });

  test("throws when length exceeds available data", () => {
    const bytes = new Uint8Array([0x04, 0x05, 0x01]);
    assert.throws(() => readTlv(bytes, 0), /exceeds|past/);
  });

  test("throws on truncated input while reading the tag byte", () => {
    assert.throws(() => readTlv(new Uint8Array([]), 0), /out of bounds/);
  });
});

describe("readChildren", () => {
  test("reads consecutive sibling TLVs exactly filling the range", () => {
    // SEQUENCE { INTEGER 1, INTEGER 2 } — read only the two INTEGER children.
    const bytes = new Uint8Array([0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
    const children = readChildren(bytes, 0, bytes.length);
    assert.strictEqual(children.length, 2);
    assert.strictEqual(readInteger(bytes, expectChild(children, 0, DER_TAG.integer)), 1n);
    assert.strictEqual(readInteger(bytes, expectChild(children, 1, DER_TAG.integer)), 2n);
  });

  test("throws when a child overruns the container length", () => {
    const bytes = new Uint8Array([0x02, 0x01, 0x01, 0x02, 0x05, 0x02]);
    assert.throws(() => readChildren(bytes, 0, 4));
  });
});

describe("readObjectIdentifier", () => {
  test("decodes 1.2.840.113549.1.7.1 (pkcs7-data)", () => {
    const bytes = new Uint8Array([
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01,
    ]);
    assert.strictEqual(readObjectIdentifier(bytes, readTlv(bytes, 0)), "1.2.840.113549.1.7.1");
  });

  test("decodes a short OID with first arc 2 (e.g. 2.5.4.3)", () => {
    const bytes = new Uint8Array([0x06, 0x03, 0x55, 0x04, 0x03]);
    assert.strictEqual(readObjectIdentifier(bytes, readTlv(bytes, 0)), "2.5.4.3");
  });

  test("throws for an empty OID", () => {
    const bytes = new Uint8Array([0x06, 0x00]);
    assert.throws(() => readObjectIdentifier(bytes, readTlv(bytes, 0)), /Empty/);
  });

  test("throws for a truncated OID whose final byte still has the continuation bit set", () => {
    // Valid encoding of 1.2.840.113549.1.7.1 with its last byte (0x01) corrupted to 0x81, so the
    // final sub-identifier never terminates.
    const bytes = new Uint8Array([
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x81,
    ]);
    assert.throws(() => readObjectIdentifier(bytes, readTlv(bytes, 0)), /Truncated/);
  });

  test("throws when given a non-OID tag", () => {
    const bytes = new Uint8Array([0x02, 0x01, 0x01]);
    assert.throws(() => readObjectIdentifier(bytes, readTlv(bytes, 0)), /Expected/);
  });
});

describe("readInteger", () => {
  test("decodes small positive integers", () => {
    const bytes = new Uint8Array([0x02, 0x01, 0x03]);
    assert.strictEqual(readInteger(bytes, readTlv(bytes, 0)), 3n);
  });

  test("decodes the PKCS#12 version integer (3)", () => {
    const bytes = new Uint8Array([0x02, 0x01, 0x03]);
    assert.strictEqual(readInteger(bytes, readTlv(bytes, 0)), 3n);
  });

  test("decodes multi-byte big-endian integers", () => {
    const bytes = new Uint8Array([0x02, 0x02, 0x08, 0x00]);
    assert.strictEqual(readInteger(bytes, readTlv(bytes, 0)), 2048n);
  });

  test("decodes negative integers (two's complement)", () => {
    const bytes = new Uint8Array([0x02, 0x01, 0xff]);
    assert.strictEqual(readInteger(bytes, readTlv(bytes, 0)), -1n);
  });
});

describe("contentBytes / fullBytes", () => {
  test("contentBytes returns only the value octets", () => {
    const bytes = new Uint8Array([0x04, 0x03, 0xaa, 0xbb, 0xcc]);
    assert.deepStrictEqual(
      contentBytes(bytes, readTlv(bytes, 0)),
      new Uint8Array([0xaa, 0xbb, 0xcc]),
    );
  });

  test("fullBytes returns the entire TLV encoding", () => {
    const bytes = new Uint8Array([0x04, 0x03, 0xaa, 0xbb, 0xcc]);
    assert.deepStrictEqual(fullBytes(bytes, readTlv(bytes, 0)), bytes);
  });

  test("returned arrays are independent copies, not views into the source", () => {
    const bytes = new Uint8Array([0x04, 0x03, 0xaa, 0xbb, 0xcc]);
    const copy = contentBytes(bytes, readTlv(bytes, 0));
    copy[0] = 0x00;
    assert.strictEqual(bytes[2], 0xaa);
  });
});

describe("expectTag / expectChild", () => {
  test("expectTag passes through a matching node", () => {
    const bytes = new Uint8Array([0x04, 0x00]);
    const node = readTlv(bytes, 0);
    assert.strictEqual(expectTag(node, DER_TAG.octetString), node);
  });

  test("expectTag throws on a tag mismatch", () => {
    const bytes = new Uint8Array([0x04, 0x00]);
    assert.throws(() => expectTag(readTlv(bytes, 0), DER_TAG.integer), /Expected/);
  });

  test("expectTag throws on a constructed-bit mismatch", () => {
    const bytes = new Uint8Array([0x24, 0x00]); // constructed OCTET STRING
    assert.throws(
      () => expectTag(readTlv(bytes, 0), DER_TAG.octetString, { constructed: false }),
      /constructed/,
    );
  });

  test("expectChild reads and validates the Nth sibling", () => {
    const bytes = new Uint8Array([0x02, 0x01, 0x01, 0x04, 0x01, 0x02]);
    const children = readChildren(bytes, 0, bytes.length);
    assert.strictEqual(expectChild(children, 1, DER_TAG.octetString).tag, DER_TAG.octetString);
  });

  test("expectChild throws when the index is missing", () => {
    const bytes = new Uint8Array([0x02, 0x01, 0x01]);
    const children = readChildren(bytes, 0, bytes.length);
    assert.throws(() => expectChild(children, 1, DER_TAG.octetString), /Expected/);
  });
});

describe("readExplicit", () => {
  test("unwraps an EXPLICIT [0] context tag to its single inner TLV", () => {
    // [0] { OCTET STRING "AB" }
    const bytes = new Uint8Array([0xa0, 0x04, 0x04, 0x02, 0x41, 0x42]);
    const inner = readExplicit(bytes, readTlv(bytes, 0), 0);
    assert.strictEqual(inner.tag, DER_TAG.octetString);
    assert.deepStrictEqual(contentBytes(bytes, inner), new Uint8Array([0x41, 0x42]));
  });

  test("throws when the context tag number doesn't match", () => {
    const bytes = new Uint8Array([0xa0, 0x02, 0x05, 0x00]);
    assert.throws(() => readExplicit(bytes, readTlv(bytes, 0), 1), /EXPLICIT/);
  });

  test("throws when the tag is primitive instead of constructed", () => {
    const bytes = new Uint8Array([0x80, 0x02, 0x05, 0x00]);
    assert.throws(() => readExplicit(bytes, readTlv(bytes, 0), 0), /EXPLICIT/);
  });
});

describe("readBmpString", () => {
  test("decodes UTF-16BE content", () => {
    // "Hi" as BMPString.
    const bytes = new Uint8Array([0x1e, 0x04, 0x00, 0x48, 0x00, 0x69]);
    assert.strictEqual(readBmpString(bytes, readTlv(bytes, 0)), "Hi");
  });

  test("throws on odd-length content", () => {
    const bytes = new Uint8Array([0x1e, 0x01, 0x00]);
    assert.throws(() => readBmpString(bytes, readTlv(bytes, 0)), /odd/);
  });
});
