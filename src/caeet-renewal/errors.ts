import { defineError, isTypedError } from "../error.ts";

/** Shared optional context carried by most CA EET renewal API errors. */
export interface CaeetErrorContext {
  readonly httpStatus?: number | undefined;
  readonly cause?: unknown;
}

/** An option passed to a CA EET renewal call failed local validation. */
export const createCaeetValidationError = defineError("CaeetValidationError")<{
  readonly message: string;
}>();
export type CaeetValidationError = ReturnType<typeof createCaeetValidationError>;

/** The `signer` adapter threw or rejected while producing a certificate or JWT signature. */
export const createCaeetSignerError = defineError("CaeetSignerError")<
  { readonly message: string } & CaeetErrorContext
>();
export type CaeetSignerError = ReturnType<typeof createCaeetSignerError>;

/** The request could not be sent or no response was received (DNS, TCP, TLS, ...). */
export const createCaeetNetworkError = defineError("CaeetNetworkError")<
  { readonly message: string } & CaeetErrorContext
>();
export type CaeetNetworkError = ReturnType<typeof createCaeetNetworkError>;

/** The request was aborted or exceeded its configured timeout. */
export const createCaeetTimeoutError = defineError("CaeetTimeoutError")<
  { readonly message: string } & CaeetErrorContext
>();
export type CaeetTimeoutError = ReturnType<typeof createCaeetTimeoutError>;

/**
 * The response body exceeded the defensive in-memory size limit this SDK applies to protect
 * against a malicious or misbehaving server/proxy on a custom `baseUrl`/`fetch` — real CA EET
 * renewal responses are expected to be a few kB at most.
 */
export const createCaeetResponseTooLargeError = defineError("CaeetResponseTooLargeError")<
  {
    readonly message: string;
    readonly byteLength: number;
    readonly limitBytes: number;
  } & CaeetErrorContext
>();
export type CaeetResponseTooLargeError = ReturnType<typeof createCaeetResponseTooLargeError>;

/** The server responded with a non-2xx HTTP status. */
export const createCaeetHttpError = defineError("CaeetHttpError")<
  {
    readonly message: string;
    /** Parsed `Retry-After` response header, in seconds, when present (e.g. on HTTP 429/503). */
    readonly retryAfterSeconds?: number;
  } & CaeetErrorContext
>();
export type CaeetHttpError = ReturnType<typeof createCaeetHttpError>;

/** The response body was not well-formed JSON. */
export const createCaeetJsonError = defineError("CaeetJsonError")<
  { readonly message: string } & CaeetErrorContext
>();
export type CaeetJsonError = ReturnType<typeof createCaeetJsonError>;

/**
 * The response was well-formed JSON but missing a field this SDK relies on (e.g. `reqId` from
 * `POST /request/renew`).
 */
export const createCaeetResponseSchemaError = defineError("CaeetResponseSchemaError")<
  { readonly message: string } & CaeetErrorContext
>();
export type CaeetResponseSchemaError = ReturnType<typeof createCaeetResponseSchemaError>;

/** Every typed error this module can return via `Result`. */
export type CaeetError =
  | CaeetValidationError
  | CaeetSignerError
  | CaeetNetworkError
  | CaeetTimeoutError
  | CaeetResponseTooLargeError
  | CaeetHttpError
  | CaeetJsonError
  | CaeetResponseSchemaError;

/** Narrows a `CaeetError` (or an arbitrary caught `unknown`) by its `type` discriminant. */
export function isCaeetError<T extends CaeetError["type"]>(
  error: unknown,
  type: T,
): error is Extract<CaeetError, { type: T }> {
  return isTypedError<CaeetError, T>(error, type);
}
