import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { expandRc2Key, rc2CbcDecrypt, rc2DecryptBlock, rc2EncryptBlock } from "./rc2.ts";

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

// RFC 2268 §5 official test vectors: {keyHex, effectiveKeyBits, plaintextHex, ciphertextHex}.
const RFC2268_VECTORS = [
  {
    key: "0000000000000000",
    effectiveKeyBits: 63,
    plaintext: "0000000000000000",
    ciphertext: "ebb773f993278eff",
  },
  {
    key: "ffffffffffffffff",
    effectiveKeyBits: 64,
    plaintext: "ffffffffffffffff",
    ciphertext: "278b27e42e2f0d49",
  },
  {
    key: "3000000000000000",
    effectiveKeyBits: 64,
    plaintext: "1000000000000001",
    ciphertext: "30649edf9be7d2c2",
  },
  {
    key: "88",
    effectiveKeyBits: 64,
    plaintext: "0000000000000000",
    ciphertext: "61a8a244adacccf0",
  },
  {
    key: "88bca90e90875a",
    effectiveKeyBits: 64,
    plaintext: "0000000000000000",
    ciphertext: "6ccf4308974c267f",
  },
  {
    key: "88bca90e90875a7f0f79c384627bafb2",
    effectiveKeyBits: 64,
    plaintext: "0000000000000000",
    ciphertext: "1a807d272bbe5db1",
  },
  {
    key: "88bca90e90875a7f0f79c384627bafb2",
    effectiveKeyBits: 128,
    plaintext: "0000000000000000",
    ciphertext: "2269552ab0f85ca6",
  },
  {
    key: "88bca90e90875a7f0f79c384627bafb216f80a6f85920584c42fceb0be255daf1e",
    effectiveKeyBits: 129,
    plaintext: "0000000000000000",
    ciphertext: "5b78d3a43dfff1f1",
  },
];

describe("RC2 (RFC 2268 official test vectors)", () => {
  for (const vector of RFC2268_VECTORS) {
    test(`encrypts key=${vector.key} ekb=${vector.effectiveKeyBits}`, () => {
      const K = expandRc2Key(hex(vector.key), vector.effectiveKeyBits);
      const ciphertext = rc2EncryptBlock(hex(vector.plaintext), K);
      assert.strictEqual(toHex(ciphertext), vector.ciphertext);
    });

    test(`decrypts back to plaintext for key=${vector.key} ekb=${vector.effectiveKeyBits}`, () => {
      const K = expandRc2Key(hex(vector.key), vector.effectiveKeyBits);
      const plaintext = rc2DecryptBlock(hex(vector.ciphertext), K);
      assert.strictEqual(toHex(plaintext), vector.plaintext);
    });
  }
});

describe("expandRc2Key", () => {
  test("throws on an empty key", () => {
    assert.throws(() => expandRc2Key(new Uint8Array([]), 40), /1\.\.128/);
  });

  test("throws on a key longer than 128 bytes", () => {
    assert.throws(() => expandRc2Key(new Uint8Array(129), 40), /1\.\.128/);
  });

  test("throws on an out-of-range effective key bit count", () => {
    assert.throws(() => expandRc2Key(new Uint8Array(8), 0), /1\.\.1024/);
  });
});

describe("rc2EncryptBlock / rc2DecryptBlock round-trip", () => {
  test("decrypt(encrypt(x)) === x for arbitrary blocks and key lengths", () => {
    const keys = [hex("0102030405"), hex("aabbccddeeff00112233445566778899"), hex("00")];
    const blocks = [
      hex("0000000000000000"),
      hex("ffffffffffffffff"),
      hex("0123456789abcdef"),
      hex("f0e1d2c3b4a59687"),
    ];
    for (const key of keys) {
      const K = expandRc2Key(key, key.length * 8);
      for (const block of blocks) {
        const roundTripped = rc2DecryptBlock(rc2EncryptBlock(block, K), K);
        assert.strictEqual(toHex(roundTripped), toHex(block));
      }
    }
  });

  test("throws when the block is not exactly 8 bytes", () => {
    const K = expandRc2Key(hex("0102030405"), 40);
    assert.throws(() => rc2EncryptBlock(new Uint8Array(7), K), /8 bytes/);
    assert.throws(() => rc2DecryptBlock(new Uint8Array(9), K), /8 bytes/);
  });
});

describe("rc2CbcDecrypt", () => {
  test("chains blocks with the IV, matching a manually-computed CBC decryption", () => {
    const key = hex("0102030405");
    const K = expandRc2Key(key, 40);
    const iv = hex("0011223344556677");
    const plaintext1 = hex("6162636465666768"); // "abcdefgh"
    const plaintext2 = hex("696a6b6c6d6e6f70"); // "ijklmnop"

    // Manually CBC-encrypt so this test doesn't depend on rc2EncryptBlock's CBC wiring.
    const xor8 = (a: Uint8Array, b: Uint8Array): Uint8Array => {
      const out = new Uint8Array(8);
      for (let i = 0; i < 8; i++) out[i] = (a[i] as number) ^ (b[i] as number);
      return out;
    };
    const cipher1 = rc2EncryptBlock(xor8(plaintext1, iv), K);
    const cipher2 = rc2EncryptBlock(xor8(plaintext2, cipher1), K);
    const ciphertext = new Uint8Array(16);
    ciphertext.set(cipher1, 0);
    ciphertext.set(cipher2, 8);

    const decrypted = rc2CbcDecrypt(key, 40, iv, ciphertext);
    assert.strictEqual(toHex(decrypted.subarray(0, 8)), toHex(plaintext1));
    assert.strictEqual(toHex(decrypted.subarray(8, 16)), toHex(plaintext2));
  });

  test("throws when the IV is not 8 bytes", () => {
    assert.throws(
      () => rc2CbcDecrypt(hex("0102030405"), 40, hex("00"), hex("0".repeat(16))),
      /8 bytes/,
    );
  });

  test("throws when ciphertext length isn't a multiple of 8", () => {
    assert.throws(
      () => rc2CbcDecrypt(hex("0102030405"), 40, hex("0011223344556677"), hex("00112233")),
      /multiple of 8/,
    );
  });
});
