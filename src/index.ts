/**
 * Public API of `@finitoapp/eet-client`: a low-level, portable TypeScript SDK for sending one
 * EET 2.0 (Elektronická evidence tržeb) `OdeslaniTrzby` data message per call. This entry point
 * is validator-agnostic — it has no opinion on how you produce a branded `EetReceiptData`/
 * `EetHeader`. Pick one: `@finitoapp/eet-client/builtin` (hand-rolled, no dependencies) or
 * `@finitoapp/eet-client/zod` (zod v4 schemas), or write your own. See the README for a full usage
 * example.
 */

export { createEetClient, type EetClient } from "./client.ts";
export {
  buildTrzbaElement,
  buildUnsignedEnvelope,
  serializeUnsignedRequest,
} from "./core/build-request.ts";
export {
  createCryptoKeyResponseSignatureVerifier,
  createCryptoKeySigner,
} from "./core/crypto-adapters.ts";
export { type ParseResponseContext, parseAndVerifyResponse } from "./core/parse-response.ts";
export {
  type Err,
  err,
  getOrNull,
  getOrThrow,
  isErr,
  isOk,
  type Ok,
  ok,
  type Result,
  tryAsync,
  trySync,
} from "./result.ts";
export { type EetClientOptions, EetEndpoint } from "./types/client.ts";
export {
  createEetHttpError,
  createEetMessageTooLargeError,
  createEetNetworkError,
  createEetResponseSchemaError,
  createEetSignatureError,
  createEetSignerError,
  createEetSoapFaultError,
  createEetTimeoutError,
  createEetValidationError,
  createEetXmlError,
  type EetError,
  type EetErrorContext,
  type EetHttpError,
  type EetMessageTooLargeError,
  type EetNetworkError,
  type EetResponseSchemaError,
  type EetSignatureError,
  type EetSignerError,
  type EetSoapFaultError,
  type EetTimeoutError,
  type EetValidationError,
  type EetXmlError,
  isEetError,
} from "./types/errors.ts";
export type { EetHeader, EetHeaderInput, EetSubmitOptions, Uuid } from "./types/header.ts";
export type {
  Amount,
  EetDateTime,
  EetReceiptData,
  EetReceiptDataInput,
  RegisteringUnitIdentifier,
  String20,
  String25,
  TaxPayerId,
} from "./types/receipt.ts";
export type {
  EetAcceptedOutcome,
  EetRejectedOutcome,
  EetSubmitOutcome,
  EetVerificationOutcome,
  EetWarning,
} from "./types/result.ts";
export type { EetSigner } from "./types/signer.ts";
export type {
  EetParsedSignature,
  EetVerifySignatureInput,
  ResponseSignatureVerifier,
} from "./types/verifier.ts";
