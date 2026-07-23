/**
 * Minimal, dependency-free base64 codec that behaves identically on Node.js, Bun, and in the
 * browser (unlike `Buffer`/`btoa`, which are not both available everywhere).
 */

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Reads the byte of `bytes` at `index`, asserting the loop-bound invariant that it exists. */
function byteAt(bytes: Uint8Array, index: number): number {
  const value = bytes[index];
  if (value === undefined) throw new Error(`Index ${index} is out of bounds.`);
  return value;
}

export function encodeBase64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = byteAt(bytes, i);
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    result +=
      b1 === undefined ? "=" : BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    result += b2 === undefined ? "=" : BASE64_CHARS[b2 & 0x3f];
  }
  return result;
}

export function decodeBase64(input: string): Uint8Array {
  // Looks more permissive than it is: a `=` appearing before non-trailing whitespace (not a
  // trailing run of `[\s=]`) survives this replace, but such input is not silently accepted —
  // the loop below still rejects it via `BASE64_CHARS.indexOf(ch) === -1`, since "=" is not in
  // that alphabet.
  const clean = input.replace(/[\s=]+$/g, "").replace(/\s+/g, "");
  // A trailing group of exactly 1 character (6 bits) can never represent a whole byte and isn't a
  // valid base64 padding shape at all (only 2 or 3 significant characters — 1 or 2 bytes — are);
  // left unchecked, those 6 bits would simply never reach the `bits >= 8` push below and get
  // silently dropped instead of rejected (e.g. `decodeBase64("A")` returning an empty array).
  if (clean.length % 4 === 1) {
    throw new Error(
      `Invalid base64 input: length ${clean.length} cannot represent a whole number of bytes.`,
    );
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const value = BASE64_CHARS.indexOf(ch);
    if (value === -1) throw new Error(`Invalid base64 character "${ch}".`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // Any leftover bits come from the final, partially-filled character; a well-formed base64
  // encoding always sets them to zero (RFC 4648 §3.5).
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new Error("Invalid base64 input: non-zero padding bits in the final character.");
  }
  return new Uint8Array(bytes);
}
