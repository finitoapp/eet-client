/**
 * EXPERIMENTAL — not verified against any real environment. None of the three hosts named in
 * the CA EET renewal API's own OpenAPI description (`test.`/`zkus.`/production `caeet.gov.cz`)
 * currently resolve in public DNS, so this module has never made a single real HTTP call; its
 * implementation is derived purely from reference documentation. Expect breaking changes here
 * independent of the rest of the SDK's semver (see the README's "Verzování" section) once it's
 * actually exercised against a live server.
 *
 * Optional CA EET renewal API client, imported from `@finitoapp/eet-client/caeet-renewal`: a
 * separate JWT/REST protocol (not EET SOAP submission) for automating pokladní certificate
 * renewal, per "CA EET 2 — Postupy získání pokladního certifikátu"
 * (`docs/reference/eet-2.0/CAEET_postupy_zadost_certifikat_v2.md`). The main
 * `@finitoapp/eet-client` entry point never imports this module. See the README section
 * "Automatizovaná obnova pokladního certifikátu" for usage and its documented limitations: no
 * published `baseUrl`, and no published response body schema beyond `reqId`/`pollAfterSeconds`.
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
  CaeetPkcs12Claim,
  CaeetRenewalRequest,
  CaeetRenewalRequestOptions,
  CaeetRenewalStatus,
  CaeetRequestStatusValue,
  CaeetSigner,
  CaeetUnfinishedRequests,
} from "./types.ts";
