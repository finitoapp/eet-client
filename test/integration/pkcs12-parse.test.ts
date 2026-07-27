import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { isPkcs12Error } from "../../src/pkcs12/errors.ts";
import { parsePkcs12, pickPrivateKeyCertificate } from "../../src/pkcs12/parse.ts";
import { isOk } from "../../src/result.ts";
import { REFERENCE_SAMPLE_EICS } from "../helpers.ts";
import { loadPlaygroundP12Signer } from "./p12-helper.ts";

/**
 * Opt-in, no-network integration test: parses the real `caeet/*.p12` playground files with this
 * SDK's own pure-JS/Web Crypto parser (`src/pkcs12/`) and checks the result byte-for-byte against
 * `openssl pkcs12 -legacy` extraction (`p12-helper.ts`) — the same tool/flags this repo already
 * trusts as ground truth for `p12-signing.test.ts`. This is the acceptance test for `src/pkcs12/`:
 * everything it depends on (hand-rolled RC2, DES/3DES, and the PKCS#12 KDF) has its own
 * RFC/openssl-vector unit tests, but only a real GFŘ-issued file exercises the full combination.
 *
 * Disabled by default and in CI. Enable with `EET_TEST_P12=1 bun test test/integration`.
 * Requires `openssl` in PATH (see `p12-helper.ts`).
 */
const ENABLED = process.env["EET_TEST_P12"] === "1";

const CAEET_DIR = join(import.meta.dirname, "..", "..", "caeet");
const PASSWORD_FILE = join(CAEET_DIR, "password_pokladni_cert_playground.txt");

function readPlaygroundPassword(): string {
  return readFileSync(PASSWORD_FILE, "utf8").replace(/\r?\n$/, "");
}

(ENABLED ? describe : describe.skip)(
  "parsePkcs12 vs. real playground .p12 files (opt-in, no network)",
  () => {
    const password = readPlaygroundPassword();

    for (const eic of REFERENCE_SAMPLE_EICS) {
      test(`matches openssl's extraction for ${eic}`, async () => {
        const p12Path = join(CAEET_DIR, `CA_EET-Playground-${eic}.p12`);
        const data = new Uint8Array(readFileSync(p12Path));

        const result = await parsePkcs12(data, password);
        assert.ok(
          isOk(result),
          `expected Ok for ${eic}, got ${JSON.stringify(!isOk(result) && result.error)}`,
        );
        if (!isOk(result)) return;

        const { certificateDer, keyDer } = loadPlaygroundP12Signer(eic);
        const leaf = pickPrivateKeyCertificate(result.value);
        assert.deepStrictEqual(leaf?.der, certificateDer, `${eic}: leaf certificate DER`);
        assert.deepStrictEqual(result.value.privateKey?.der, keyDer, `${eic}: private key DER`);
      });
    }

    test("returns Pkcs12InvalidMacError for the wrong password on a real file", async () => {
      const data = new Uint8Array(
        readFileSync(join(CAEET_DIR, `CA_EET-Playground-${REFERENCE_SAMPLE_EICS[0]}.p12`)),
      );
      const result = await parsePkcs12(data, `${password}-wrong`);
      assert.ok(!isOk(result));
      if (isOk(result)) return;
      assert.ok(isPkcs12Error(result.error, "Pkcs12InvalidMacError"));
    });
  },
);
