import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  brandedReceipt,
  buildPotvrzeniOdpoved,
  buildSignedOdpovedResponse,
  createTestSigner,
  readFixture,
} from "../test/helpers.ts";
import { createEetClient } from "./client.ts";
import { decodeBase64 } from "./core/base64.ts";
import { createCryptoKeyResponseSignatureVerifier } from "./core/crypto-adapters.ts";
import { getOrThrow } from "./result.ts";
import type { EetClientOptions } from "./types/client.ts";

/**
 * This suite exercises the SDK's signer/verifier path using ONLY `globalThis.crypto.subtle`
 * (Web Crypto) — the same API surface available in a browser — never `node:crypto`. Loading
 * fixture bytes from disk uses `node:fs`, which is test-harness plumbing, not part of the
 * signing/verification logic under test.
 */

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");
  return decodeBase64(base64);
}

function readPlaygroundCaCertDer(fileName: string): Uint8Array {
  const path = join(import.meta.dirname, "..", "caeet", fileName);
  return pemToDer(readFileSync(path, "utf8"));
}

describe("EET playground CA certificates (caeet/)", () => {
  test("root and sub CA certificates decode to well-formed, distinct DER X.509 structures", () => {
    const root = readPlaygroundCaCertDer("ca_eet-root_cert-playground.crt");
    const sub = readPlaygroundCaCertDer("ca_eet-sub_cert-playground.crt");

    // A DER-encoded X.509 Certificate is a SEQUENCE (tag 0x30) with a length that accounts for
    // the whole remaining structure.
    for (const der of [root, sub]) {
      assert.strictEqual(der[0], 0x30);
      assert.ok(der.length > 500);
    }
    assert.notDeepStrictEqual(root, sub);

    // Root-trusts-sub is exactly the shape a responseSignatureVerifier would use these files
    // for: extract the leaf certificate from a Potvrzeni response and chain it up to these
    // playground trust anchors. We don't have a certificate actually issued by this CA to
    // exercise full chain validation here (that requires the private key, which only GFŘ
    // holds), so this test only proves the trust material itself is intact and usable.
  });
});

describe("End-to-end submit() with a Web Crypto-only signer and verifier", () => {
  test("builds, signs, sends, and verifies a full OdeslaniTrzby round trip", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const verifier = createCryptoKeyResponseSignatureVerifier(
      readFixture("test-signer.pub.spki.der"),
      readFixture("test-signer.cert.der"),
    );

    const receipt = brandedReceipt({
      eic_popl: "CZ8551015704",
      id_jednotky: "181",
      id_pokl: "00/2535/CN58",
      porad_cis: "0/2482/IE25",
      dat_trzby: "2027-01-07T22:01:00+01:00",
      celk_trzba: "87988.00",
    });

    const serverSigner = signer; // the fake "EET system" signs its confirmation with the same key
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const requestXml = new TextDecoder().decode(init?.body as Uint8Array);
      const uuidMatch = requestXml.match(/uuid_zpravy="([^"]+)"/);
      const uuid = uuidMatch?.[1];
      if (uuid === undefined) throw new Error("test fetch: could not find uuid_zpravy in request");

      const responseXml = await buildSignedOdpovedResponse(
        buildPotvrzeniOdpoved({
          uuid,
          receivedAt: "2027-01-07T22:01:05+01:00",
          pok: "987a6be5-6af5-44f3-b4fc-987654321000-ff",
          test: true,
        }),
        serverSigner,
      );
      return new Response(responseXml, {
        status: 200,
        headers: { "X-Global-Transaction-Id": "playground-trace-1" },
      });
    }) as unknown as typeof fetch;

    const client = createEetClient({
      endpoint: "https://pg.trzbyeet.gov.cz:443/eet/services/EETServiceSOAP/v4",
      signer,
      responseSignatureVerifier: verifier,
      fetch: fetchImpl,
    });

    const outcome = getOrThrow(await client.submit(receipt, { firstSubmission: true }));

    assert.strictEqual(outcome.status, "accepted");
    if (outcome.status !== "accepted") throw new Error("unreachable");
    assert.strictEqual(outcome.pok, "987a6be5-6af5-44f3-b4fc-987654321000-ff");
    assert.strictEqual(outcome.test, true);
    assert.strictEqual(outcome.globalTransactionId, "playground-trace-1");
  });
});

describe("submit() with a failing signer", () => {
  test("returns Err(EetSignerError) instead of throwing/rejecting when signer.sign() rejects", async () => {
    const workingSigner = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const failingSigner = {
      getCertificate: workingSigner.getCertificate,
      sign: () => Promise.reject(new Error("HSM timed out")),
    };
    const verifier = createCryptoKeyResponseSignatureVerifier(
      readFixture("test-signer.pub.spki.der"),
      readFixture("test-signer.cert.der"),
    );
    const fetchImpl = (() => {
      throw new Error("fetch must not be called when signing fails");
    }) as unknown as typeof fetch;

    const client = createEetClient({
      endpoint: "https://pg.trzbyeet.gov.cz:443/eet/services/EETServiceSOAP/v4",
      signer: failingSigner,
      responseSignatureVerifier: verifier,
      fetch: fetchImpl,
    });

    const result = await client.submit(
      brandedReceipt({
        eic_popl: "CZ8551015704",
        id_jednotky: "181",
        id_pokl: "00/2535/CN58",
        porad_cis: "0/2482/IE25",
        dat_trzby: "2027-01-07T22:01:00+01:00",
        celk_trzba: "87988.00",
      }),
      { firstSubmission: true },
    );

    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.strictEqual(result.error.type, "EetSignerError");
  });
});

describe("createEetClient input validation", () => {
  /**
   * `EetClientOptions` marks these fields as required, so a TypeScript caller building a plain
   * object literal can never omit them. These tests simulate the callers who can: plain JS, or
   * TS with a type assertion (e.g. options assembled from config/DI) — the exact boundary
   * `createEetClient` guards with an immediate throw instead of a confusing failure deep inside
   * `submit()`.
   */
  async function validOptions(): Promise<EetClientOptions> {
    return {
      endpoint: "https://pg.trzbyeet.gov.cz:443/eet/services/EETServiceSOAP/v4",
      signer: await createTestSigner("test-signer.cert.der", "test-signer.key.pk8"),
      responseSignatureVerifier: createCryptoKeyResponseSignatureVerifier(
        readFixture("test-signer.pub.spki.der"),
        readFixture("test-signer.cert.der"),
      ),
    };
  }

  test("throws EetValidationError when responseSignatureVerifier is missing", async () => {
    const { responseSignatureVerifier: _, ...rest } = await validOptions();

    try {
      createEetClient(rest as unknown as EetClientOptions);
      throw new Error("unreachable");
    } catch (error) {
      assert.partialDeepStrictEqual(error, {
        type: "EetValidationError",
        issues: ["responseSignatureVerifier"],
      });
    }
  });

  test("throws EetValidationError when signer is missing", async () => {
    const { signer: _, ...rest } = await validOptions();

    try {
      createEetClient(rest as unknown as EetClientOptions);
      throw new Error("unreachable");
    } catch (error) {
      assert.partialDeepStrictEqual(error, { type: "EetValidationError", issues: ["signer"] });
    }
  });

  test("throws EetValidationError when endpoint is missing", async () => {
    const { endpoint: _, ...rest } = await validOptions();

    try {
      createEetClient(rest as unknown as EetClientOptions);
      throw new Error("unreachable");
    } catch (error) {
      assert.partialDeepStrictEqual(error, { type: "EetValidationError", issues: ["endpoint"] });
    }
  });
});
