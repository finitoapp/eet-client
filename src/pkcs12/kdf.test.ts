import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { derivePkcs12Bits, PKCS12_KDF_ID } from "./kdf.ts";

function hex(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("derivePkcs12Bits", () => {
  // Real-world vector: MAC key derived from a genuine `openssl pkcs12 -export -legacy` file
  // (password "testpass123", MAC salt/iteration count read from its actual MacData). Confirmed
  // correct by an independent route — HMAC-SHA1 with this exact key over that file's actual
  // authSafe bytes reproduces its stored MAC digest byte-for-byte (see the pkcs12 integration
  // test / parse.test.ts, which exercises the full file rather than this single derived value).
  test("derives the real MAC key from a genuine openssl-generated .p12 file", async () => {
    const salt = hex("06faeca3e446989e407fb6328a0e2718");
    const macKey = await derivePkcs12Bits("testpass123", salt, 2048, PKCS12_KDF_ID.mac, 20);
    assert.strictEqual(toHex(macKey), "25b4d2c6ec291975e9ce5a4edceea073f2bbffc1");
  });

  test("returns exactly the requested output length", async () => {
    for (const length of [1, 5, 8, 16, 20, 24, 40, 41]) {
      const bits = await derivePkcs12Bits("pw", hex("00112233"), 1, PKCS12_KDF_ID.key, length);
      assert.strictEqual(bits.length, length);
    }
  });

  test("is deterministic for identical inputs", async () => {
    const a = await derivePkcs12Bits("pw", hex("aabbccdd"), 10, PKCS12_KDF_ID.key, 20);
    const b = await derivePkcs12Bits("pw", hex("aabbccdd"), 10, PKCS12_KDF_ID.key, 20);
    assert.strictEqual(toHex(a), toHex(b));
  });

  test("a longer output's first chunk matches a shorter request with the same parameters", async () => {
    // The KDF only starts mutating its internal state (I) *after* producing a chunk, so the very
    // first 20 (SHA-1 output size) bytes must be identical regardless of how many chunks are
    // ultimately requested.
    const short = await derivePkcs12Bits("pw", hex("aabbccdd"), 10, PKCS12_KDF_ID.key, 20);
    const long = await derivePkcs12Bits("pw", hex("aabbccdd"), 10, PKCS12_KDF_ID.key, 45);
    assert.strictEqual(toHex(long.subarray(0, 20)), toHex(short));
  });

  test("different id values (key/iv/mac) produce different output", async () => {
    const key = await derivePkcs12Bits("pw", hex("aabbccdd"), 10, PKCS12_KDF_ID.key, 20);
    const iv = await derivePkcs12Bits("pw", hex("aabbccdd"), 10, PKCS12_KDF_ID.iv, 20);
    const mac = await derivePkcs12Bits("pw", hex("aabbccdd"), 10, PKCS12_KDF_ID.mac, 20);
    assert.notStrictEqual(toHex(key), toHex(iv));
    assert.notStrictEqual(toHex(iv), toHex(mac));
    assert.notStrictEqual(toHex(key), toHex(mac));
  });

  test("different passwords produce different output", async () => {
    const a = await derivePkcs12Bits("password1", hex("aabbccdd"), 10, PKCS12_KDF_ID.key, 20);
    const b = await derivePkcs12Bits("password2", hex("aabbccdd"), 10, PKCS12_KDF_ID.key, 20);
    assert.notStrictEqual(toHex(a), toHex(b));
  });

  test("supports an empty salt", async () => {
    const bits = await derivePkcs12Bits("pw", new Uint8Array(0), 1, PKCS12_KDF_ID.key, 5);
    assert.strictEqual(bits.length, 5);
  });

  test("supports an empty password", async () => {
    const bits = await derivePkcs12Bits("", hex("aabbccdd"), 1, PKCS12_KDF_ID.key, 5);
    assert.strictEqual(bits.length, 5);
  });

  test("throws on a non-positive iteration count", async () => {
    await assert.rejects(
      derivePkcs12Bits("pw", hex("00"), 0, PKCS12_KDF_ID.key, 5),
      /between 1 and/,
    );
  });

  test("throws when the iteration count exceeds the defensive upper bound", async () => {
    await assert.rejects(
      derivePkcs12Bits("pw", hex("00"), 2_000_001, PKCS12_KDF_ID.key, 5),
      /between 1 and/,
    );
  });

  test("throws when the iteration count is Infinity (e.g. from an oversized attacker-supplied DER INTEGER)", async () => {
    await assert.rejects(
      derivePkcs12Bits("pw", hex("00"), Number.POSITIVE_INFINITY, PKCS12_KDF_ID.key, 5),
      /between 1 and/,
    );
  });

  test("throws on a non-positive output length", async () => {
    await assert.rejects(
      derivePkcs12Bits("pw", hex("00"), 1, PKCS12_KDF_ID.key, 0),
      /output length/,
    );
  });
});
