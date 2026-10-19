/**
 * Experimental CA EET renewal client, based on the bundled caeetapi_jwt.yml OpenAPI schema.
 * This separate JWT/REST protocol is not imported by the main EET SOAP entry point.
 */
export { type CaeetRenewalClient, createCaeetRenewalClient } from "./client.ts";
export {
  ackCaeetPkcs12Download,
  claimCaeetPkcs12,
  getCaeetRenewalStatus,
  listUnfinishedCaeetRequests,
  requestCaeetRenewal,
} from "./endpoints.ts";
export {
  type CaeetError,
  type CaeetErrorContext,
  type CaeetHttpError,
  type CaeetJsonError,
  type CaeetNetworkError,
  type CaeetResponseSchemaError,
  type CaeetResponseTooLargeError,
  type CaeetSignerError,
  type CaeetTimeoutError,
  type CaeetValidationError,
  createCaeetHttpError,
  createCaeetJsonError,
  createCaeetNetworkError,
  createCaeetResponseSchemaError,
  createCaeetResponseTooLargeError,
  createCaeetSignerError,
  createCaeetTimeoutError,
  createCaeetValidationError,
  isCaeetError,
} from "./errors.ts";
export {
  type BuildCaeetAuthorizationJwtOptions,
  buildCaeetAuthorizationJwt,
} from "./jwt.ts";
export type {
  CaeetCertificate,
  CaeetPkcs12Claim,
  CaeetRenewalRequest,
  CaeetRenewalRequestOptions,
  CaeetRenewalStatus,
  CaeetRequestStatus,
  CaeetRequestStatusValue,
  CaeetSigner,
  CaeetUnfinishedRequests,
} from "./types.ts";
export { CaeetEndpoint } from "./types.ts";
