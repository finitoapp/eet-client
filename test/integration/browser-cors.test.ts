import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EetEndpoint } from "../../src/types/client.ts";

/**
 * Opt-in, LIVE integration test: checks whether the real EET playground endpoint
 * (`https://pg.trzbyeet.gov.cz`) sends the CORS response headers a browser would require to let
 * page JavaScript call it directly from an arbitrary origin.
 *
 * The SDK's request is not a CORS "simple request" (`Content-Type: text/xml` plus a custom
 * `SOAPAction` header), so a real browser sends a CORS preflight `OPTIONS` request first and
 * only proceeds with the actual `POST` if the preflight response grants that:
 *  - `Access-Control-Allow-Origin` matches (or is `*`) for the calling page's origin
 *  - `Access-Control-Allow-Methods` includes `POST`
 *
 * This test sends that same preflight, with an arbitrary, made-up `Origin`, directly against the
 * real endpoint (Node/Bun's `fetch` does not itself enforce CORS, so the response headers can be
 * inspected regardless of outcome) and asserts the endpoint does NOT grant cross-origin access.
 * That is the expected, documented behavior for this API — it is a server-to-server SOAP service
 * secured by mutual TLS/client certificates, not one meant to be called from browser JS — so a
 * failing assertion here would mean the server started allowing exactly the kind of arbitrary
 * cross-origin browser access this SDK's integrators should not rely on.
 *
 * Disabled by default and in CI. Enable with `EET_TEST_CORS=1 bun test test/integration`.
 * Requires network access to the playground.
 */
const ENABLED = process.env["EET_TEST_CORS"] === "1";

const ARBITRARY_ORIGIN = "https://totally-unrelated-integrator.example";

(ENABLED ? describe : describe.skip)("Live EET playground CORS behavior (opt-in, network)", () => {
  test("does not grant an arbitrary browser origin permission to call the SOAP endpoint", {
    timeout: 15_000,
  }, async () => {
    const response = await fetch(EetEndpoint.playground, {
      method: "OPTIONS",
      headers: {
        Origin: ARBITRARY_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,soapaction",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const allowOrigin = response.headers.get("access-control-allow-origin");
    const allowMethods = response.headers.get("access-control-allow-methods");

    // A real browser only sends the actual POST once the preflight grants both of these. Absent
    // (or non-matching) values mean the preflight fails client-side and the request never goes
    // out — i.e. the endpoint is not callable from arbitrary-domain browser JavaScript.
    const grantsArbitraryOrigin = allowOrigin === "*" || allowOrigin === ARBITRARY_ORIGIN;
    const grantsPost = (allowMethods?.split(",").map((method) => method.trim()) ?? []).includes(
      "POST",
    );

    assert.strictEqual(grantsArbitraryOrigin, false);
    assert.strictEqual(grantsPost, false);
  });
});
