import type { EetSigner } from "../types/signer.ts";

/**
 * Signing adapter for the CA EET renewal API's JWT authentication. Structurally identical to
 * {@link EetSigner} — RS256 is the same RSASSA-PKCS1-v1_5/SHA-256 signing this SDK already
 * requires for `<Trzba>` submission — so an existing `EetSigner` backed by the certificate being
 * renewed can be passed here as-is, with no separate adapter to write.
 */
export type CaeetSigner = EetSigner;

/** Options shared by every CA EET renewal API call. */
export interface CaeetRenewalRequestOptions {
  /** Base URL of the CA EET renewal API, e.g. {@link CaeetEndpoint.production}. */
  readonly baseUrl: string;
  /** Signs the JWT with the private key of the certificate being renewed. */
  readonly signer: CaeetSigner;
  /** Custom `fetch` implementation, e.g. for testing or non-standard transports. */
  readonly fetch?: typeof fetch;
  /** Request timeout in milliseconds. No timeout is applied when omitted. */
  readonly timeoutMs?: number;
  /**
   * Seconds between the authorization JWT's `iat` and `exp`. Default 60; must be an integer in
   * `(0, 300]` per the server's hard cap. Raise this if `signer.sign()` (e.g. an HSM/KMS-backed
   * signer) plus network latency to the CA EET server can exceed the default window, which would
   * otherwise cause the token to expire before the server validates it.
   */
  readonly ttlSeconds?: number;
}

/** CA EET renewal API environments published in caeetapi_jwt.yml. */
export const CaeetEndpoint = {
  test: "https://test.caeet.gov.cz/api",
  trial: "https://zkus.caeet.gov.cz/api",
  production: "https://caeet.gov.cz/api",
} as const;

/** The five states distinguished by RequestStatusDTO. */
export type CaeetRequestStatusValue = CaeetRequestStatus["state"];

interface CaeetRequestStatusBase {
  readonly reqId: string;
  readonly pollAfterSeconds?: number;
}

/** RequestStatusDTO, discriminated by the server's state field. */
export type CaeetRequestStatus = CaeetRequestStatusBase &
  (
    | { readonly state: "INPROCESS"; readonly pollAfterSeconds: number }
    | { readonly state: "ISSUED" | "DELIVERING" | "FINISHED" }
    | { readonly state: "REJECTED"; readonly rejectedReason: string }
  );

/** Result of POST /request/renew. */
export interface CaeetRenewalRequest {
  readonly reqId: string;
  readonly raw: unknown;
}

/** Result of GET /request/{reqId}/status, including the original JSON body. */
export type CaeetRenewalStatus = CaeetRequestStatus & {
  readonly retryAfterSeconds?: number;
  readonly raw: unknown;
};

/** Certificate metadata returned with a PKCS#12 download (CertificateDTO). */
export interface CaeetCertificate {
  readonly sn: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly state: "VALID" | "EXPIRED" | "REVOKED" | "ON_CRL";
  readonly revocationTime?: string;
  readonly description?: string;
  readonly email?: string;
}

/** Result of POST /request/{reqId}/claim-download. Never log or cache this data. */
export interface CaeetPkcs12Claim {
  /** PKCS#12 encoded as base64, unchanged from the server. */
  readonly pkcs12: string;
  readonly password: string;
  readonly certificate: CaeetCertificate;
  readonly raw: unknown;
}

/** Result of GET /request/not-finished (ReqIdListDTO). */
export interface CaeetUnfinishedRequests {
  readonly count: number;
  readonly data: ReadonlyArray<string>;
  readonly raw: unknown;
}
