/**
 * PKCS#12's password-based key/IV/MAC-key derivation (RFC 7292 Appendix B.2, "General Method"),
 * specialized to SHA-1 (`u`=20 bytes / `v`=64 bytes) since that's the only hash the observed
 * playground `.p12` files use, for both `MacData` and every PBE `AlgorithmIdentifier`. Deprecated
 * for new use per the RFC (PBES2/PBKDF2 is recommended instead) but still required to read
 * `.p12` files produced by tools that predate that guidance — which is the entire point of this
 * module.
 */
import { at, concatBytes } from "../core/bytes.ts";

const SHA1_BLOCK_BYTES = 64; // "v" in the RFC.
const SHA1_OUTPUT_BYTES = 20; // "u" in the RFC.

/**
 * Hard ceiling on the iteration count, defense-in-depth against a hostile `.p12` file: this value
 * is read directly from untrusted file bytes (`MacData.iterations`/`PKCS12PBEParams.iterations`)
 * and used *before* the password is even confirmed correct (the MAC check itself needs it), so an
 * unbounded value — or one large enough that `Number(bigint)` collapses to `Infinity`, which would
 * otherwise sail past a plain `iterations < 1` check — would let a single crafted file hang any
 * caller parsing it. Real files use iteration counts in the hundreds to low thousands (RFC 7292
 * examples, and every `.p12` this SDK has seen, use 1000-2048); this is far above any legitimate
 * value while still bounding worst-case work to a few seconds.
 */
const MAX_ITERATIONS = 2_000_000;

async function sha1(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", data as BufferSource));
}

/** RFC 7292 Appendix B.1: password as a BMPString (UTF-16BE), NUL-terminated. */
function passwordToBmpString(password: string): Uint8Array {
  const bytes = new Uint8Array(password.length * 2 + 2);
  for (let i = 0; i < password.length; i++) {
    const code = password.charCodeAt(i);
    bytes[i * 2] = (code >> 8) & 0xff;
    bytes[i * 2 + 1] = code & 0xff;
  }
  // Trailing 0x00 0x00 terminator is already present: `bytes` is zero-initialized and exactly
  // 2 bytes longer than the encoded characters.
  return bytes;
}

/**
 * RFC 7292 Appendix B.2 steps 2/3: repeats `source` to a multiple of `blockSize` bytes (the last
 * copy truncated), or returns empty if `source` is empty (per the RFC's explicit empty-salt/
 * empty-password carve-out).
 */
function fillToBlockSize(source: Uint8Array, blockSize: number): Uint8Array {
  if (source.length === 0) return new Uint8Array(0);
  const totalLength = Math.ceil(source.length / blockSize) * blockSize;
  const out = new Uint8Array(totalLength);
  for (let i = 0; i < totalLength; i++) {
    out[i] = at(source, i % source.length);
  }
  return out;
}

/** RFC 7292 Appendix B.2 step 6.C: in place, sets `block = (block + addend + 1) mod 2^(8*block.length)`. */
function addBlockMod2v(block: Uint8Array, addend: Uint8Array): void {
  if (block.length !== addend.length) throw new Error("Block and addend must be the same length.");
  let carry = 1;
  for (let i = block.length - 1; i >= 0; i--) {
    const sum = at(block, i) + at(addend, i) + carry;
    block[i] = sum & 0xff;
    carry = sum >> 8;
  }
}

/** RFC 7292 Appendix B.3: which kind of pseudorandom material {@link derivePkcs12Bits} produces. */
export const PKCS12_KDF_ID = {
  key: 1,
  iv: 2,
  mac: 3,
} as const;

export type Pkcs12KdfId = (typeof PKCS12_KDF_ID)[keyof typeof PKCS12_KDF_ID];

/**
 * RFC 7292 Appendix B.2, specialized to SHA-1: derives `outputLength` pseudorandom bytes from
 * `password`, `salt`, and `iterations`, for the purpose identified by `id` (key material, an IV,
 * or a MAC key — see {@link PKCS12_KDF_ID}).
 */
export async function derivePkcs12Bits(
  password: string,
  salt: Uint8Array,
  iterations: number,
  id: Pkcs12KdfId,
  outputLength: number,
): Promise<Uint8Array> {
  if (iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new Error(
      `PKCS#12 KDF iteration count must be between 1 and ${MAX_ITERATIONS}, got ${iterations}.`,
    );
  }
  if (outputLength < 1)
    throw new Error(`PKCS#12 KDF output length must be >= 1, got ${outputLength}.`);

  const diversifier = new Uint8Array(SHA1_BLOCK_BYTES).fill(id);
  const saltFilled = fillToBlockSize(salt, SHA1_BLOCK_BYTES);
  const passwordFilled = fillToBlockSize(passwordToBmpString(password), SHA1_BLOCK_BYTES);
  const I = concatBytes(saltFilled, passwordFilled);

  const chunkCount = Math.ceil(outputLength / SHA1_OUTPUT_BYTES);
  const output = new Uint8Array(chunkCount * SHA1_OUTPUT_BYTES);

  for (let chunk = 0; chunk < chunkCount; chunk++) {
    let a = concatBytes(diversifier, I);
    for (let round = 0; round < iterations; round++) a = await sha1(a);
    output.set(a, chunk * SHA1_OUTPUT_BYTES);

    if (chunk < chunkCount - 1) {
      const B = fillToBlockSize(a, SHA1_BLOCK_BYTES);
      for (let offset = 0; offset < I.length; offset += SHA1_BLOCK_BYTES) {
        addBlockMod2v(I.subarray(offset, offset + SHA1_BLOCK_BYTES), B);
      }
    }
  }

  return output.subarray(0, outputLength);
}
