import { encodeBase64Url } from "../core/base64.ts";
import { sha256 } from "../core/webcrypto.ts";
import { err, ok, type Result } from "../result.ts";
import {
  type CaeetSignerError,
  type CaeetValidationError,
  createCaeetSignerError,
  createCaeetValidationError,
} from "./errors.ts";
import type { CaeetSigner } from "./types.ts";

/**
 * Server-enforced hard cap: the reference document states the server rejects tokens whose `exp`
 * is set more than 5 minutes after `iat` ("server odmítá tokeny, u kterých je exp nastaveno na
 * více než 5 minut od iat").
 */
const MAX_TTL_SECONDS = 5 * 60;
const DEFAULT_TTL_SECONDS = 60;

export interface BuildCaeetAuthorizationJwtOptions {
  /** Seconds between `iat` and `exp`. Default 60; must be an integer in `(0, 300]`. */
  readonly ttlSeconds?: number;
}

/**
 * Builds the RS256 JWT the CA EET renewal API requires as `Authorization: Bearer <token>`,
 * signed by `signer` — per "CA EET 2 — Postupy získání pokladního certifikátu", this must be the
 * certificate being renewed. Produces exactly the minimal payload the document allows (`exp`,
 * `iat` only, both `NumericDate`) and identifies the certificate solely via the header's
 * `x5t#S256` (`x5c` is intentionally never used, per the same document — the server looks the
 * certificate up by thumbprint, not by an embedded copy).
 */
export async function buildCaeetAuthorizationJwt(
  signer: CaeetSigner,
  options: BuildCaeetAuthorizationJwtOptions = {},
): Promise<Result<string, CaeetSignerError | CaeetValidationError>> {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
    return err(
      createCaeetValidationError({
        message: `ttlSeconds must be an integer in (0, ${MAX_TTL_SECONDS}], got ${ttlSeconds}.`,
      }),
    );
  }

  let certificateDer: Uint8Array;
  try {
    certificateDer = await signer.getCertificate();
  } catch (error) {
    return err(
      createCaeetSignerError({
        message: "signer failed to produce a certificate.",
        cause: error,
      }),
    );
  }

  const thumbprint = encodeBase64Url(await sha256(certificateDer));
  const header = { alg: "RS256", typ: "JWT", "x5t#S256": thumbprint };
  const iat = Math.floor(Date.now() / 1000);
  const payload = { exp: iat + ttlSeconds, iat };

  const encoder = new TextEncoder();
  const headerB64 = encodeBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  let signature: Uint8Array;
  try {
    signature = await signer.sign(encoder.encode(signingInput));
  } catch (error) {
    return err(
      createCaeetSignerError({
        message: "signer failed to sign the JWT.",
        cause: error,
      }),
    );
  }

  return ok(`${signingInput}.${encodeBase64Url(signature)}`);
}
