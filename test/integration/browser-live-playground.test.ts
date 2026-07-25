import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chromium } from "playwright";
import { encodeBase64 } from "../../src/core/base64.ts";
import type { EetSubmitOutcome } from "../../src/types/result.ts";
import { loadPlaygroundP12Signer } from "./p12-helper.ts";

/**
 * Opt-in, LIVE integration test: the browser twin of `live-playground.test.ts`. Instead of
 * calling `createEetClient(...).submit()` from Bun, it bundles `browser-harness.ts` for the
 * browser and runs that same call — signing, `fetch`, response parsing, and signature
 * verification — inside a real, headless Chromium tab, against the real EET playground
 * (`https://pg.trzbyeet.gov.cz`).
 *
 * The playground does not send CORS headers granting cross-origin access (see
 * `browser-cors.test.ts`), so a real browser's preflight would block the request before it ever
 * left the page. This test launches Chromium with `--disable-web-security` to suppress that
 * enforcement. That flag is scoped entirely to this test's own throwaway, headless Chromium
 * instance — Playwright always launches with a fresh temporary profile, never a real user's
 * browser or persistent data — so it disables CORS only for this one automated session, never
 * for the shipped SDK (which sends no CORS-relevant code at all) or any real integrator.
 *
 * Disabled by default and in CI. Enable with `EET_TEST_LIVE_PLAYGROUND_BROWSER=1 bun test
 * test/integration`. Requires `openssl` in PATH (see `p12-helper.ts`), network access to the
 * playground, and a locally installed Chromium (`bunx playwright install chromium`) — Playwright
 * does not ship a browser binary by default and none is installed in CI.
 */
const ENABLED = process.env["EET_TEST_LIVE_PLAYGROUND_BROWSER"] === "1";

interface EetBrowserHarnessWindow {
  __runEetBrowserSubmit(
    certificateDerBase64: string,
    keyDerBase64: string,
  ): Promise<EetSubmitOutcome>;
}

(ENABLED ? describe : describe.skip)(
  "Live EET playground round trip in a real browser (opt-in, network)",
  () => {
    test("submit() run inside a real Chromium tab accepts a valid receipt with a verified signature", {
      timeout: 30_000,
    }, async () => {
      const build = await Bun.build({
        entrypoints: [new URL("./browser-harness.ts", import.meta.url).pathname],
        target: "browser",
        format: "esm",
      });
      if (!build.success) {
        throw new AggregateError(
          build.logs,
          "Failed to bundle browser-harness.ts for the browser.",
        );
      }
      const [bundleOutput] = build.outputs;
      if (bundleOutput === undefined)
        throw new Error("Bun.build produced no output for browser-harness.ts.");
      const bundleText = await bundleOutput.text();

      const { certificateDer, keyDer } = loadPlaygroundP12Signer("CZ8551015704");
      const certificateDerBase64 = encodeBase64(certificateDer);
      const keyDerBase64 = encodeBase64(keyDer);

      // `crypto.subtle` only exists in a "secure context"; `about:blank`'s opaque origin does not
      // qualify, but loopback addresses always do regardless of scheme. A throwaway local server
      // just gives the page a `http://localhost` origin to be served from.
      const server = Bun.serve({
        port: 0,
        fetch: () =>
          new Response("<!doctype html><title>eet-browser-harness</title>", {
            headers: { "content-type": "text/html" },
          }),
      });

      const browser = await chromium.launch({
        headless: true,
        // --no-sandbox is required in sandboxed/containerized dev environments without a working
        // user namespace; harmless for this throwaway, headless-only instance.
        args: ["--disable-web-security", "--no-sandbox"],
      });
      try {
        const page = await browser.newPage();
        await page.goto(`http://localhost:${server.port}/`);
        await page.addScriptTag({ content: bundleText, type: "module" });

        const outcome = await page.evaluate(
          ([certB64, keyB64]) =>
            (window as unknown as EetBrowserHarnessWindow).__runEetBrowserSubmit(certB64, keyB64),
          [certificateDerBase64, keyDerBase64] as [string, string],
        );

        assert.strictEqual(outcome.status, "accepted");
        if (outcome.status !== "accepted") throw new Error("unreachable");
        assert.strictEqual(outcome.test, true);
        assert.strictEqual(outcome.pok.endsWith("-ff"), true); // playground POK is always fictitious
      } finally {
        await browser.close();
        server.stop();
      }
    });
  },
);
