/**
 * Not constant-time (short-circuits on the first differing byte) — a deliberate choice, not an
 * oversight: every call site compares values that are already effectively public in this SDK's
 * threat model (a digest derived from the same attacker-controlled response it's checked
 * against, or a public X.509 certificate for pinning), so a timing side channel here can't leak
 * anything the caller doesn't already control. Revisit if this is ever reused to compare a
 * genuine secret (e.g. an HMAC key or password) against attacker input.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
