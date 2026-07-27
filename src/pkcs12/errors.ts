import { defineError, isTypedError } from "../error.ts";

/** The PFX structure itself couldn't be decoded, or uses a bag/algorithm shape this module doesn't support. */
export const createPkcs12MalformedError = defineError("Pkcs12MalformedError")<{
  readonly message: string;
  readonly cause?: unknown;
}>();
export type Pkcs12MalformedError = ReturnType<typeof createPkcs12MalformedError>;

/**
 * `MacData` integrity verification failed. In practice this almost always means the password is
 * wrong — a valid PFX with the wrong password fails the MAC check before any bag is even
 * decrypted.
 */
export const createPkcs12InvalidMacError = defineError("Pkcs12InvalidMacError")<{
  readonly message: string;
}>();
export type Pkcs12InvalidMacError = ReturnType<typeof createPkcs12InvalidMacError>;

/** Every typed error {@link parsePkcs12} can return via `Result`. */
export type Pkcs12Error = Pkcs12MalformedError | Pkcs12InvalidMacError;

/** Narrows a `Pkcs12Error` (or an arbitrary caught `unknown`) by its `type` discriminant. */
export function isPkcs12Error<T extends Pkcs12Error["type"]>(
  error: unknown,
  type: T,
): error is Extract<Pkcs12Error, { type: T }> {
  return isTypedError<Pkcs12Error, T>(error, type);
}
