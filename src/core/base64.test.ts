import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeBase64, encodeBase64 } from "./base64.ts";

describe("encodeBase64 / decodeBase64 round trip", () => {
  test("round-trips a 0-byte input", () => {
    const bytes = new Uint8Array([]);
    assert.strictEqual(encodeBase64(bytes), "");
    assert.deepStrictEqual(decodeBase64(encodeBase64(bytes)), bytes);
  });

  test("round-trips a 1-byte input with '==' padding", () => {
    const bytes = new Uint8Array([0xff]);
    const encoded = encodeBase64(bytes);
    assert.strictEqual(encoded, "/w==");
    assert.deepStrictEqual(decodeBase64(encoded), bytes);
  });

  test("round-trips a 2-byte input with '=' padding", () => {
    const bytes = new Uint8Array([0xff, 0x01]);
    const encoded = encodeBase64(bytes);
    assert.strictEqual(encoded, "/wE=");
    assert.deepStrictEqual(decodeBase64(encoded), bytes);
  });

  test("round-trips a 3-byte input with no padding", () => {
    const bytes = new Uint8Array([0xff, 0x01, 0x02]);
    const encoded = encodeBase64(bytes);
    assert.strictEqual(encoded, "/wEC");
    assert.deepStrictEqual(decodeBase64(encoded), bytes);
  });

  test("round-trips a multi-group input spanning several 3-byte groups", () => {
    const bytes = new Uint8Array(Array.from({ length: 37 }, (_, i) => i * 7));
    assert.deepStrictEqual(decodeBase64(encodeBase64(bytes)), bytes);
  });

  test("decodeBase64 ignores whitespace between characters", () => {
    const bytes = new Uint8Array([0xff, 0x01, 0x02]);
    assert.deepStrictEqual(decodeBase64(" /w\nEC \t"), bytes);
  });
});

describe("decodeBase64 rejects malformed input", () => {
  test("rejects a single leftover character instead of silently dropping it", () => {
    // 1 base64 character (6 bits) can never represent a whole byte, and is not a valid trailing
    // group shape (only 2 or 3 significant characters are) — this must be rejected, not silently
    // decoded to an empty/truncated result.
    assert.throws(() => decodeBase64("A"));
  });

  test("rejects a length-5 input (4 full chars + 1 leftover)", () => {
    assert.throws(() => decodeBase64("/wEC/"));
  });

  test("rejects a character outside the base64 alphabet", () => {
    assert.throws(() => decodeBase64("/wE!"));
  });

  test("rejects a non-trailing '=' instead of silently stripping it", () => {
    // The trailing-whitespace/padding regex only strips a run of `[\s=]` anchored at the end of
    // the string — a "=" followed by more content (not itself whitespace/"=") is not part of
    // that trailing run and survives into the decode loop, where it's rejected as an
    // out-of-alphabet character rather than silently treated as padding.
    assert.throws(() => decodeBase64("/w=E"));
  });

  test("rejects a final character whose padding bits are not zero", () => {
    // "/w" (2 significant chars, 1 encoded byte) canonically decodes 0xFF with its trailing 4
    // padding bits all zero. "/z" encodes the same leading byte (0xFF) but leaves non-zero
    // low-order bits (0b0011) in the second character — not a canonical encoding of any byte
    // sequence, and must be rejected rather than silently decoded to the same 0xFF.
    assert.deepStrictEqual(decodeBase64("/w"), new Uint8Array([0xff]));
    assert.throws(() => decodeBase64("/z"));
  });
});
