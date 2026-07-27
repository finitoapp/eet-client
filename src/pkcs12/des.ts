/**
 * DES and Triple DES (TDEA), implemented only because the private key SafeBag inside GFŘ's
 * playground `.p12` files is encrypted with `pbeWithSHA1And3-KeyTripleDES-CBC` — an algorithm
 * Web Crypto (`crypto.subtle`) never implements. Tables and steps are transcribed directly from
 * FIPS PUB 46-3 (Data Encryption Standard); bit positions in the tables below are 1-indexed
 * exactly as printed there (bit 1 = most significant bit of the block/key).
 *
 * Implemented on a "bit array" (one `Uint8Array` byte, 0 or 1, per bit) rather than packed 32-bit
 * words: every table in FIPS 46-3 is a permutation/selection expressed as bit *positions*, so a
 * bit array lets each table become a direct, transcription-checkable lookup (`table[i] - 1`)
 * instead of hand-derived shift/mask arithmetic. Verified against `openssl enc -des-ecb`/
 * `-des-ede3-cbc` output for known key/IV/plaintext (see `des.test.ts`) — this catches any
 * transcription error in the tables below, not just logic bugs.
 */
import { at } from "../core/bytes.ts";

// FIPS 46-3 p.10: initial permutation.
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64,
  56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53,
  45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];

// FIPS 46-3 p.10: final permutation (inverse of IP).
const IP_INV = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37,
  5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2,
  42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];

// FIPS 46-3 p.13: E bit-selection table (32 -> 48 bits).
const ETABLE = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19,
  20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];

// FIPS 46-3 p.15: permutation function P (32 -> 32 bits) applied to the S-box output.
const PTABLE = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13,
  30, 6, 22, 11, 4, 25,
];

// FIPS 46-3 p.19: permuted choice 1 (64 -> 56 bits), split into the C/D halves by the caller.
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60,
  52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21,
  13, 5, 28, 20, 12, 4,
];

// FIPS 46-3 p.21: permuted choice 2 (56 -> 48 bits), producing each round's subkey.
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52,
  31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];

// FIPS 46-3 p.21: per-round left-shift schedule applied to both the C and D halves.
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

// FIPS Appendix 1 pp.17-18: the eight 4x16 selection functions S1..S8, each flattened row-major.
const SBOXES: ReadonlyArray<ReadonlyArray<number>> = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11,
    9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5,
    11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10,
    6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2,
    11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12,
    11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4,
    15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1,
    10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9,
    4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10,
    3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6,
    15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14,
    0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10,
    11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12,
    2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9,
    5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11,
    0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13,
    15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

/** One bit per element (value 0 or 1), most-significant-bit first — mirrors FIPS 46-3's 1-indexed bit numbering. */
type Bits = Uint8Array;

function bytesToBits(bytes: Uint8Array): Bits {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    const byte = at(bytes, i);
    for (let b = 0; b < 8; b++) bits[i * 8 + b] = (byte >> (7 - b)) & 1;
  }
  return bits;
}

function bitsToBytes(bits: Bits): Uint8Array {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    let value = 0;
    for (let b = 0; b < 8; b++) value = (value << 1) | at(bits, i * 8 + b);
    out[i] = value;
  }
  return out;
}

/** Applies a 1-indexed bit-position table: `output[i] = input[table[i] - 1]`. */
function permute(input: Bits, table: ReadonlyArray<number>): Bits {
  const out = new Uint8Array(table.length);
  for (let i = 0; i < table.length; i++) out[i] = at(input, at(table, i) - 1);
  return out;
}

function xorBits(a: Bits, b: Bits): Bits {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = at(a, i) ^ at(b, i);
  return out;
}

/** Circular left rotation, used for the 28-bit `C`/`D` key-schedule halves. */
function rotateLeft(bits: Bits, count: number): Bits {
  const len = bits.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = at(bits, (i + count) % len);
  return out;
}

/** FIPS 46-3 "Cipher Function f": expands+mixes `R` (32 bits) with a round subkey `K` (48 bits) into 32 bits. */
function feistel(R: Bits, K: Bits): Bits {
  const expanded = permute(R, ETABLE);
  const mixed = xorBits(expanded, K);
  const substituted = new Uint8Array(32);
  for (let box = 0; box < 8; box++) {
    const base = box * 6;
    const b0 = at(mixed, base);
    const b1 = at(mixed, base + 1);
    const b2 = at(mixed, base + 2);
    const b3 = at(mixed, base + 3);
    const b4 = at(mixed, base + 4);
    const b5 = at(mixed, base + 5);
    const row = (b0 << 1) | b5;
    const col = (b1 << 3) | (b2 << 2) | (b3 << 1) | b4;
    const value = at(at(SBOXES, box), row * 16 + col);
    for (let bit = 0; bit < 4; bit++) substituted[box * 4 + bit] = (value >> (3 - bit)) & 1;
  }
  return permute(substituted, PTABLE);
}

/** The 16 round subkeys (each 48 bits) produced by the DES key schedule `KS` from an 8-byte key. */
export type DesSubkeys = ReadonlyArray<Bits>;

/** FIPS 46-3 "Key schedule calculation": expands an 8-byte DES key into its 16 round subkeys. */
export function expandDesKey(key: Uint8Array): DesSubkeys {
  if (key.length !== 8) throw new Error(`DES key must be 8 bytes, got ${key.length}.`);
  const permuted = permute(bytesToBits(key), PC1);
  let C: Bits = permuted.slice(0, 28);
  let D: Bits = permuted.slice(28, 56);
  const subkeys: Bits[] = [];
  for (let round = 0; round < 16; round++) {
    const shift = at(SHIFTS, round);
    C = rotateLeft(C, shift);
    D = rotateLeft(D, shift);
    const CD = new Uint8Array(56);
    CD.set(C, 0);
    CD.set(D, 28);
    subkeys.push(permute(CD, PC2));
  }
  return subkeys;
}

function desBlock(block: Uint8Array, subkeys: DesSubkeys, decrypt: boolean): Uint8Array {
  if (block.length !== 8) throw new Error(`DES block must be 8 bytes, got ${block.length}.`);
  const permuted = permute(bytesToBits(block), IP);
  let L: Bits = permuted.slice(0, 32);
  let R: Bits = permuted.slice(32, 64);
  const order = decrypt ? subkeys.slice().reverse() : subkeys;
  for (const K of order) {
    const nextL = R;
    const nextR = xorBits(L, feistel(R, K));
    L = nextL;
    R = nextR;
  }
  const preOutput = new Uint8Array(64);
  preOutput.set(R, 0);
  preOutput.set(L, 32);
  return bitsToBytes(permute(preOutput, IP_INV));
}

/** Encrypts one 8-byte block with a DES key schedule from {@link expandDesKey}. */
export function desEncryptBlock(block: Uint8Array, subkeys: DesSubkeys): Uint8Array {
  return desBlock(block, subkeys, false);
}

/** Decrypts one 8-byte block (the exact inverse of {@link desEncryptBlock}). */
export function desDecryptBlock(block: Uint8Array, subkeys: DesSubkeys): Uint8Array {
  return desBlock(block, subkeys, true);
}

/**
 * Triple-DES (TDEA) CBC decryption: `key` is 16 bytes (2-key, `K1`/`K2`/`K1`) or 24 bytes (3-key,
 * `K1`/`K2`/`K3`) — `pbeWithSHAAnd3-KeyTripleDES-CBC` (the algorithm PKCS#12 shrouds private keys
 * with) always uses the 24-byte, 3-key form. Per FIPS 46-3 Appendix 2, TDEA decryption is
 * `D_K1(E_K2(D_K3(I)))`. `iv` and `ciphertext` must both be multiples of 8 bytes; caller strips
 * PKCS#5 padding.
 */
export function tripleDesCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  if (key.length !== 16 && key.length !== 24) {
    throw new Error(`Triple DES key must be 16 or 24 bytes, got ${key.length}.`);
  }
  if (iv.length !== 8) throw new Error(`Triple DES IV must be 8 bytes, got ${iv.length}.`);
  if (ciphertext.length % 8 !== 0) {
    throw new Error(
      `Triple DES ciphertext length must be a multiple of 8, got ${ciphertext.length}.`,
    );
  }

  const k1 = expandDesKey(key.subarray(0, 8));
  const k2 = expandDesKey(key.subarray(8, 16));
  const k3 = key.length === 24 ? expandDesKey(key.subarray(16, 24)) : k1;

  const out = new Uint8Array(ciphertext.length);
  let prev = iv;
  for (let offset = 0; offset < ciphertext.length; offset += 8) {
    const block = ciphertext.subarray(offset, offset + 8);
    const step1 = desDecryptBlock(block, k3);
    const step2 = desEncryptBlock(step1, k2);
    const step3 = desDecryptBlock(step2, k1);
    for (let i = 0; i < 8; i++) out[offset + i] = at(step3, i) ^ at(prev, i);
    prev = block;
  }
  return out;
}
