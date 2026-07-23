import { defineError } from "../error.ts";

/** Shared optional context carried by most SDK errors. */
export interface EetErrorContext {
  readonly httpStatus?: number | undefined;
  readonly globalTransactionId?: string | undefined;
  readonly cause?: unknown;
}

/** The receipt or submit options failed local validation and were never sent. */
export const createEetValidationError = defineError("EetValidationError")<{
  readonly message: string;
  readonly issues: readonly string[];
}>();
export type EetValidationError = ReturnType<typeof createEetValidationError>;

/** The fully assembled, signed SOAP envelope exceeds the 12 kB UTF-8 limit. */
export const createEetMessageTooLargeError = defineError("EetMessageTooLargeError")<{
  readonly message: string;
  readonly byteLength: number;
  readonly limitBytes: number;
}>();
export type EetMessageTooLargeError = ReturnType<typeof createEetMessageTooLargeError>;

/** The request could not be sent or no response was received (DNS, TCP, TLS, ...). */
export const createEetNetworkError = defineError("EetNetworkError")<
  { readonly message: string } & EetErrorContext
>();
export type EetNetworkError = ReturnType<typeof createEetNetworkError>;

/** The request was aborted or exceeded its configured timeout. */
export const createEetTimeoutError = defineError("EetTimeoutError")<
  { readonly message: string } & EetErrorContext
>();
export type EetTimeoutError = ReturnType<typeof createEetTimeoutError>;

/**
 * The server responded with an unexpected HTTP status and the body was not a recognizable
 * SOAP Fault or EET `Odpoved` response (e.g. a proxy error page).
 */
export const createEetHttpError = defineError("EetHttpError")<
  { readonly message: string } & EetErrorContext
>();
export type EetHttpError = ReturnType<typeof createEetHttpError>;

/** The server responded with a SOAP Fault instead of an `Odpoved` element. */
export const createEetSoapFaultError = defineError("EetSoapFaultError")<
  {
    readonly message: string;
    readonly faultCode?: string;
    readonly faultString?: string;
  } & EetErrorContext
>();
export type EetSoapFaultError = ReturnType<typeof createEetSoapFaultError>;

/** The response body was not well-formed XML, or used a disallowed construct (DTD, entity). */
export const createEetXmlError = defineError("EetXmlError")<
  { readonly message: string } & EetErrorContext
>();
export type EetXmlError = ReturnType<typeof createEetXmlError>;

/** The response XML did not match the expected EET namespace/structure. */
export const createEetResponseSchemaError = defineError("EetResponseSchemaError")<
  { readonly message: string } & EetErrorContext
>();
export type EetResponseSchemaError = ReturnType<typeof createEetResponseSchemaError>;

/**
 * The response signature is missing, malformed, uses an algorithm other than the ones
 * mandated by the EET specification, fails digest/cryptographic verification, or no
 * `responseSignatureVerifier` was supplied for a response that requires one.
 */
export const createEetSignatureError = defineError("EetSignatureError")<
  { readonly message: string } & EetErrorContext
>();
export type EetSignatureError = ReturnType<typeof createEetSignatureError>;

/** The `signer` adapter threw or rejected while producing a certificate or signature. */
export const createEetSignerError = defineError("EetSignerError")<
  { readonly message: string } & EetErrorContext
>();
export type EetSignerError = ReturnType<typeof createEetSignerError>;

/** Every typed error this SDK can return via `Result` (or throw from `createEetClient`). */
export type EetError =
  | EetValidationError
  | EetMessageTooLargeError
  | EetNetworkError
  | EetTimeoutError
  | EetHttpError
  | EetSoapFaultError
  | EetXmlError
  | EetResponseSchemaError
  | EetSignatureError
  | EetSignerError;

/** Narrows an `EetError` (or an arbitrary caught `unknown`) by its `type` discriminant. */
export function isEetError<T extends EetError["type"]>(
  error: unknown,
  type: T,
): error is Extract<EetError, { type: T }> {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type: unknown }).type === type
  );
}
