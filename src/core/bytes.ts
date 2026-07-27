/** Reads `array[index]`, throwing instead of silently propagating `undefined` on an out-of-range index. */
export function at<T>(array: ArrayLike<T>, index: number): T {
  const value = array[index];
  if (value === undefined) throw new Error(`Index ${index} is out of bounds.`);
  return value;
}

/**
 * Not constant-time (short-circuits on the first differing byte) — a deliberate choice, not an
 * oversight: every call site compares values that are already effectively public in this SDK's
 * threat model (a digest derived from the same attacker-controlled response it's checked
 * against, or a public X.509 certificate for pinning), so a timing side channel here can't leak
 * anything the caller doesn't already control. Revisit if this is ever reused to compare a
 * genuine secret (e.g. an HMAC key or password) against attacker input — see {@link constantTimeEqual}.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Constant-time byte comparison: unlike {@link bytesEqual}, this never short-circuits on the
 * first differing byte, so it's safe to compare a value derived from a genuine secret (e.g. an
 * HMAC/MAC) against attacker-controlled input. The length check is not timing-sensitive here —
 * lengths of MACs/digests are a fixed, public property of the algorithm, not secret — only the
 * *content* comparison needs to run in constant time.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= at(a, i) ^ at(b, i);
  }
  return diff === 0;
}

/** Concatenates any number of byte arrays into a single new `Uint8Array`. */
export function concatBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
