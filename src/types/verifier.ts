/**
 * XML digital signature data extracted from a successful (`<Potvrzeni>`) EET response,
 * already parsed and canonicalized by the SDK. All algorithm identifiers have already been
 * checked by the SDK against the fixed set mandated by the EET specification
 * (Exclusive C14N 1.0, SHA-256, RSA-SHA256); a verifier does not need to re-check them, but
 * may inspect them for logging or defense in depth.
 */
export interface EetParsedSignature {
  /** Exclusive C14N 1.0 canonical bytes of the `<soap:Body>` element that was signed. */
  readonly signedBodyCanonical: Uint8Array;
  /** Exclusive C14N 1.0 canonical bytes of the `<ds:SignedInfo>` element. */
  readonly signedInfoCanonical: Uint8Array;
  /** Raw RSA-SHA256 signature bytes (decoded from `<ds:SignatureValue>`). */
  readonly signatureValue: Uint8Array;
  /** Digest bytes declared in `<ds:DigestValue>` (already validated to match the body). */
  readonly digestValue: Uint8Array;
  /**
   * DER-encoded X.509 certificate(s) from the `wsse:BinarySecurityToken` that
   * `ds:KeyInfo`/`wsse:SecurityTokenReference` actually identifies by `wsu:Id` — any other,
   * unreferenced `BinarySecurityToken` elements under `wsse:Security` are ignored, so a decoy
   * token can't affect which certificate is checked. Currently always exactly one element,
   * since the EET specification attaches a single signing certificate, not a chain.
   */
  readonly certificates: readonly Uint8Array[];
  /** Canonicalization algorithm URI, e.g. `http://www.w3.org/2001/10/xml-exc-c14n#`. */
  readonly canonicalizationAlgorithm: string;
  /** Digest algorithm URI, e.g. `http://www.w3.org/2001/04/xmlenc#sha256`. */
  readonly digestAlgorithm: string;
  /** Signature algorithm URI, e.g. `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`. */
  readonly signatureAlgorithm: string;
}

/** Input passed to a {@link ResponseSignatureVerifier}. */
export interface EetVerifySignatureInput {
  /** The raw, untouched SOAP response body as received over HTTP. */
  readonly raw: string;
  /** Parsed and canonicalized XMLDSig data extracted from `raw` by the SDK. */
  readonly signature: EetParsedSignature;
}

/**
 * Mandatory asynchronous adapter that verifies the cryptographic signature of an EET
 * response, together with the validity and trustworthiness of the certificate chain.
 * The SDK has already checked that the signature's algorithms match those mandated by the
 * specification and that the digest matches the signed body; the verifier is responsible for
 * the actual RSA-SHA256 signature check and for deciding whether `signature.certificates`
 * chains up to a trusted root (e.g. the playground or production EET CA).
 *
 * A confirmation is never returned as a successful `accepted` result unless this adapter
 * resolves to `true`.
 */
export interface ResponseSignatureVerifier {
  verify(input: EetVerifySignatureInput): PromiseLike<boolean>;
}
