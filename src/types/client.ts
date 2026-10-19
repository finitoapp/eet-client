import type { EetCryptoBackend } from "../core/webcrypto.ts";
import type { EetSigner } from "./signer.ts";
import type { ResponseSignatureVerifier } from "./verifier.ts";

/** Official EET 2.0 SOAP endpoints. */
export const EetEndpoint = {
  production: "https://trzbyeet.gov.cz/eet/services/EETServiceSOAP/v4",
  playground: "https://pg.trzbyeet.gov.cz/eet/services/EETServiceSOAP/v4",
} as const;

export interface EetClientOptions {
  readonly cryptoBackend?: EetCryptoBackend;
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
