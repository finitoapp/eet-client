import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeBase64Url, encodeBase64Url } from "../core/base64.ts";
import { getOrThrow } from "../result.ts";
import { buildCaeetAuthorizationJwt } from "./jwt.ts";
import type { CaeetSigner } from "./types.ts";

function decodeJsonPart(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
}

function fakeSigner(overrides: Partial<CaeetSigner> = {}): CaeetSigner {
  return {
    getCertificate: () => new Uint8Array([1, 2, 3, 4, 5]),
    sign: async (data) => new Uint8Array([...data].map((b) => b ^ 0xff)),
    ...overrides,
  };
}

describe("buildCaeetAuthorizationJwt", () => {
  test("produces a three-part token with the exact header shape mandated by the spec", async () => {
    const certificateDer = new Uint8Array([1, 2, 3, 4, 5]);
    const signer = fakeSigner({ getCertificate: () => certificateDer });

    const jwt = getOrThrow(await buildCaeetAuthorizationJwt(signer));
    const parts = jwt.split(".");
    assert.strictEqual(parts.length, 3);

    const [headerB64, payloadB64] = parts;
    const header = decodeJsonPart(headerB64 ?? "") as Record<string, unknown>;
    assert.strictEqual(header["alg"], "RS256");
    assert.strictEqual(header["typ"], "JWT");
    assert.strictEqual(header["x5c"], undefined);

    const expectedThumbprint = encodeBase64Url(
      new Uint8Array(await crypto.subtle.digest("SHA-256", certificateDer as BufferSource)),
    );
    assert.strictEqual(header["x5t#S256"], expectedThumbprint);

    const payload = decodeJsonPart(payloadB64 ?? "") as Record<string, unknown>;
    assert.strictEqual(typeof payload["iat"], "number");
    assert.strictEqual(typeof payload["exp"], "number");
    assert.strictEqual((payload["exp"] as number) - (payload["iat"] as number), 60);
    assert.deepStrictEqual(Object.keys(payload).sort(), ["exp", "iat"]);
  });

  test("signs exactly the header.payload signing input, base64url-encoded", async () => {
    let signedInput: Uint8Array | undefined;
    const signer = fakeSigner({
      sign: async (data) => {
        signedInput = data;
        return new Uint8Array([9, 9, 9]);
      },
    });

    const jwt = getOrThrow(await buildCaeetAuthorizationJwt(signer));
    const [headerB64, payloadB64, signatureB64] = jwt.split(".");

    assert.strictEqual(new TextDecoder().decode(signedInput), `${headerB64}.${payloadB64}`);
    assert.deepStrictEqual(decodeBase64Url(signatureB64 ?? ""), new Uint8Array([9, 9, 9]));
  });

  test("honors a custom ttlSeconds", async () => {
    const jwt = getOrThrow(await buildCaeetAuthorizationJwt(fakeSigner(), { ttlSeconds: 120 }));
    const [, payloadB64] = jwt.split(".");
    const payload = decodeJsonPart(payloadB64 ?? "") as { iat: number; exp: number };
    assert.strictEqual(payload.exp - payload.iat, 120);
  });

  test("rejects a ttlSeconds above the server's 5-minute limit", async () => {
    const result = await buildCaeetAuthorizationJwt(fakeSigner(), { ttlSeconds: 301 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetValidationError");
  });

  test("rejects a non-positive ttlSeconds", async () => {
    const result = await buildCaeetAuthorizationJwt(fakeSigner(), { ttlSeconds: 0 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetValidationError");
  });

  test("rejects a non-integer ttlSeconds", async () => {
    const result = await buildCaeetAuthorizationJwt(fakeSigner(), { ttlSeconds: 1.5 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetValidationError");
  });

  test("wraps a getCertificate() rejection in CaeetSignerError", async () => {
    const signer = fakeSigner({
      getCertificate: () => {
        throw new Error("HSM unavailable");
      },
    });
    const result = await buildCaeetAuthorizationJwt(signer);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetSignerError");
  });

  test("wraps a sign() rejection in CaeetSignerError", async () => {
    const signer = fakeSigner({
      sign: async () => {
        throw new Error("HSM unavailable");
      },
    });
    const result = await buildCaeetAuthorizationJwt(signer);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetSignerError");
  });
});
