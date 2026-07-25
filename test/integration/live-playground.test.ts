import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { describe, test } from "node:test";
import { createEetClient } from "../../src/client.ts";
import { getOrThrow } from "../../src/result.ts";
import { EetEndpoint } from "../../src/types/client.ts";
import type { EetParsedSignature, ResponseSignatureVerifier } from "../../src/types/verifier.ts";
import { brandedReceipt } from "../helpers.ts";
import { loadPlaygroundP12Signer } from "./p12-helper.ts";

/**
 * Opt-in, LIVE integration test: sends a real `OdeslaniTrzby` request to the EET playground
 * (`https://pg.trzbyeet.gov.cz`) using a genuine cash-register certificate from `caeet/*.p12`, and
 * cryptographically verifies the real signed confirmation.
 *
 * Uses live/production mode (not `verification: true`) deliberately: per the EET specification,
 * only a `<Potvrzeni>` response carries a signature (a verification-mode `<Chyba kod="0">` never
 * does), and this test exists specifically to exercise that signature path against a real
 * server. This is safe on the playground: per the official EET playground docs, sending a data
 * message to the non-production environment does not fulfill the obligation to report the sale
 * data — nothing is legally recorded.
 *
 * The response's signing certificate is issued by "I.CA Public CA/RSA 06/2022" per the EET
 * playground access docs — a different CA than `caeet/ca_eet-*.crt` (which only issues
 * cash-register certificates, i.e. signs the *outgoing* request). This test therefore verifies the
 * cryptographic RSA-SHA256 signature and the issuer's identity string, but does NOT chain that
 * issuer up to I.CA's real root (not bundled in this repo) — that is a real gap an integrator's
 * production verifier must close, e.g. with I.CA's published root from https://www.ica.cz.
 *
 * Disabled by default and in CI. Enable with `EET_TEST_LIVE_PLAYGROUND=1 bun test test/integration`.
 * Requires `openssl` in PATH (see `p12-helper.ts`) and network access to the playground.
 */
const ENABLED = process.env["EET_TEST_LIVE_PLAYGROUND"] === "1";

function nowAsEetDateTime(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

const trustingButUnchainedVerifier: ResponseSignatureVerifier = {
  async verify({ signature }: { signature: EetParsedSignature }) {
    const leafDer = signature.certificates[0];
    if (leafDer === undefined) return false;
    const leaf = new X509Certificate(Buffer.from(leafDer));
    if (!leaf.issuer.includes("I.CA")) return false; // sanity check only, not chain validation

    const publicKey = leaf.publicKey;
    return crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      (await crypto.subtle.importKey(
        "spki",
        publicKey.export({ type: "spki", format: "der" }) as BufferSource,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      )) as CryptoKey,
      signature.signatureValue as BufferSource,
      signature.signedInfoCanonical as BufferSource,
    );
  },
};

(ENABLED ? describe : describe.skip)("Live EET playground round trip (opt-in, network)", () => {
  test("submit() against the real playground accepts a valid receipt with a verified signature", {
    timeout: 20_000,
  }, async () => {
    const { signer } = loadPlaygroundP12Signer("CZ8551015704");
    const client = createEetClient({
      endpoint: EetEndpoint.playground,
      signer,
      responseSignatureVerifier: trustingButUnchainedVerifier,
      timeoutMs: 15_000,
    });

    const receipt = brandedReceipt({
      eic_popl: "CZ8551015704",
      id_jednotky: "24",
      id_pokl: "sdk-integration-test",
      porad_cis: `run-${Date.now()}`,
      dat_trzby: nowAsEetDateTime(),
      celk_trzba: "1.00",
    });

    const outcome = getOrThrow(await client.submit(receipt, { firstSubmission: true }));

    assert.strictEqual(outcome.status, "accepted");
    if (outcome.status !== "accepted") throw new Error("unreachable");
    assert.strictEqual(outcome.test, true);
    assert.strictEqual(outcome.pok.endsWith("-ff"), true); // playground POK is always fictitious
  });
});
