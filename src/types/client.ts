import type { EetSigner } from "./signer.ts";
import type { ResponseSignatureVerifier } from "./verifier.ts";

/**
 * Well-known EET 2.0 endpoints. The production endpoint is intentionally not included: per
 * the specification it must be supplied by the integrator once GFŘ officially publishes it,
 * never guessed or hard-coded by the SDK.
 */
export const EetEndpoint = {
  playground: "https://pg.trzbyeet.gov.cz:443/eet/services/EETServiceSOAP/v4",
} as const;

export interface EetClientOptions {
  /** Target `OdeslaniTrzby` SOAP endpoint URL, e.g. {@link EetEndpoint.playground}. */
  readonly endpoint: string;
  /** Adapter providing the taxpayer's certificate and signing capability. */
  readonly signer: EetSigner;
  /** Mandatory adapter verifying the signature of `<Potvrzeni>` responses. */
  readonly responseSignatureVerifier: ResponseSignatureVerifier;
  /** Custom `fetch` implementation, e.g. for testing or non-standard transports. */
  readonly fetch?: typeof fetch;
  /** Request timeout in milliseconds. No timeout is applied when omitted. */
  readonly timeoutMs?: number;
}
