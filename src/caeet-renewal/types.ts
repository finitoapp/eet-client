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
  /**
   * Base URL of the CA EET renewal API, e.g. `https://caeet.gov.cz/api`. No reference document
   * publishes this host — per "CA EET 2 — Postupy získání pokladního certifikátu", the actual
   * URLs are part of `caeetapi_jwt.yml`, which is not distributed with this SDK — so, like
   * `EetClientOptions.endpoint` for the (also unpublished) production EET submission endpoint,
   * the integrator must supply it.
   */
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

/**
 * The five states `RequestStatusDTO` distinguishes, per the reference document. Provided for
 * reference/casting convenience only — this SDK does not parse this value out of a response
 * itself, see {@link CaeetRenewalStatus}.
 */
export type CaeetRequestStatusValue =
  | "INPROCESS"
  | "ISSUED"
  | "DELIVERING"
  | "FINISHED"
  | "REJECTED";

/** Result of `POST /request/renew`. */
export interface CaeetRenewalRequest {
  /** The created request's identifier, read from the response body's `reqId` field. */
  readonly reqId: string;
  /** Full parsed JSON response body. */
  readonly raw: unknown;
}

/**
 * Result of `GET /request/{reqId}/status`. Only `pollAfterSeconds`/`retryAfterSeconds` are named
 * literally (`.pollAfterSeconds`, the `Retry-After` header) by the reference document — the field
 * backing the `INPROCESS`/`ISSUED`/`DELIVERING`/`FINISHED`/`REJECTED` status enum itself is not,
 * so this SDK does not guess it. Read it from `raw` once you have the authoritative
 * `caeetapi_jwt.yml` schema or have inspected a real response.
 */
export interface CaeetRenewalStatus {
  /** From the response body's `pollAfterSeconds` field, when present (typically `INPROCESS`). */
  readonly pollAfterSeconds?: number;
  /** Parsed `Retry-After` response header, in seconds, when present. */
  readonly retryAfterSeconds?: number;
  /** Full parsed JSON response body (`RequestStatusDTO`). */
  readonly raw: unknown;
}

/**
 * Result of `POST /request/{reqId}/claim-download`. The reference document describes the
 * response (`Pkcs12DTO`) only in prose ("PKCS#12 v base64, heslo pro jeho otevření a metadata
 * vydaného certifikátu") without naming any field literally, so this SDK does not guess field
 * names for the PKCS#12 data or password — unlike `reqId`/`pollAfterSeconds` above, guessing
 * wrong here (e.g. checking a field that doesn't exist) would fail silently. Parse `raw` yourself
 * once you have the real schema or a live response to inspect.
 *
 * The data behind `raw` is highly sensitive (a password-derivable PKCS#12 private key) — never
 * log or cache it, see README, "Bezpečné nakládání s certifikáty".
 */
export interface CaeetPkcs12Claim {
  readonly raw: unknown;
}

/** Result of `GET /request/not-finished`. */
export interface CaeetUnfinishedRequests {
  /** Full parsed JSON response body — a list of `reqId`s, per the reference document's prose. */
  readonly raw: unknown;
}
