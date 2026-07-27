import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { desDecryptBlock, desEncryptBlock, expandDesKey, tripleDesCbcDecrypt } from "./des.ts";

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

describe("DES (single block)", () => {
  // Classic textbook known-answer vector, independently cross-checked against
  // `openssl enc -des-ecb -provider legacy -provider default -K 133457799bbcdff1`.
  const KEY = "133457799bbcdff1";
  const PLAINTEXT = "0123456789abcdef";
  const CIPHERTEXT = "85e813540f0ab405";

  test("encrypts the classic single-DES known-answer vector", () => {
    const subkeys = expandDesKey(hex(KEY));
    assert.strictEqual(toHex(desEncryptBlock(hex(PLAINTEXT), subkeys)), CIPHERTEXT);
  });

  test("decrypts back to the known plaintext", () => {
    const subkeys = expandDesKey(hex(KEY));
    assert.strictEqual(toHex(desDecryptBlock(hex(CIPHERTEXT), subkeys)), PLAINTEXT);
  });

  test("throws when the key is not 8 bytes", () => {
    assert.throws(() => expandDesKey(new Uint8Array(7)), /8 bytes/);
  });

  test("throws when the block is not 8 bytes", () => {
    const subkeys = expandDesKey(hex(KEY));
    assert.throws(() => desEncryptBlock(new Uint8Array(9), subkeys), /8 bytes/);
  });

  test("round-trips arbitrary blocks under arbitrary keys", () => {
    const keys = [hex("0000000000000000"), hex("ffffffffffffffff"), hex("0f1571c947d9e859")];
    const blocks = [hex("0000000000000000"), hex("ffffffffffffffff"), hex("0123456789abcdef")];
    for (const key of keys) {
      const subkeys = expandDesKey(key);
      for (const block of blocks) {
        assert.strictEqual(
          toHex(desDecryptBlock(desEncryptBlock(block, subkeys), subkeys)),
          toHex(block),
        );
      }
    }
  });
});

describe("tripleDesCbcDecrypt", () => {
  // Generated locally via:
  //   openssl enc -des-ede3-cbc -e -K 000102030405060708090a0b0c0d0e0f1011121314151617 \
  //     -iv 0102030405060708 -nopad
  // on plaintext "abcdefghijklmnop" — an independent, locally-produced oracle (not a value
  // transcribed from any external source), chosen precisely to catch table transcription errors.
  const KEY_3 = "000102030405060708090a0b0c0d0e0f1011121314151617";
  const IV = "0102030405060708";
  const PLAINTEXT = "6162636465666768696a6b6c6d6e6f70"; // "abcdefghijklmnop"
  const CIPHERTEXT = "74cbcd7e54bc97d4a738112bc4272a0b";

  test("decrypts a 3-key (24-byte) Triple DES CBC vector generated via openssl", () => {
    const decrypted = tripleDesCbcDecrypt(hex(KEY_3), hex(IV), hex(CIPHERTEXT));
    assert.strictEqual(toHex(decrypted), PLAINTEXT);
  });

  test("2-key (16-byte, K1=K3) form decrypts data encrypted the same way", () => {
    const k1 = hex("0001020304050607");
    const k2 = hex("08090a0b0c0d0e0f");
    const key16 = new Uint8Array(16);
    key16.set(k1, 0);
    key16.set(k2, 8);

    const iv = hex(IV);
    const block = hex(PLAINTEXT).subarray(0, 8);
    const xored = new Uint8Array(8);
    for (let i = 0; i < 8; i++) xored[i] = (block[i] as number) ^ (iv[i] as number);

    // TDEA encryption with K3=K1 (the 2-key form), computed from the same block primitives this
    // module exposes — an independent round-trip check, not a value from an external source.
    const encryptedBlock = manualTdeaEncryptBlock(xored, k1, k2, k1);
    const decrypted = tripleDesCbcDecrypt(key16, iv, encryptedBlock);
    assert.strictEqual(toHex(decrypted.subarray(0, 8)), toHex(block));
  });

  test("throws on an invalid key length", () => {
    assert.throws(
      () => tripleDesCbcDecrypt(hex("00112233"), hex(IV), hex(CIPHERTEXT)),
      /16 or 24 bytes/,
    );
  });

  test("throws on an invalid IV length", () => {
    assert.throws(() => tripleDesCbcDecrypt(hex(KEY_3), hex("0011"), hex(CIPHERTEXT)), /8 bytes/);
  });

  test("throws when ciphertext length isn't a multiple of 8", () => {
    assert.throws(() => tripleDesCbcDecrypt(hex(KEY_3), hex(IV), hex("001122")), /multiple of 8/);
  });
});

function manualTdeaEncryptBlock(
  block: Uint8Array,
  k1: Uint8Array,
  k2: Uint8Array,
  k3: Uint8Array,
): Uint8Array {
  const s1 = expandDesKey(k1);
  const s2 = expandDesKey(k2);
  const s3 = expandDesKey(k3);
  // TDEA encryption: O = E_K3(D_K2(E_K1(I))).
  return desEncryptBlock(desDecryptBlock(desEncryptBlock(block, s1), s2), s3);
}
