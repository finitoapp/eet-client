import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { encodeBase64 } from "../../src/core/base64.ts";
import { DS_NAMESPACE, SOAP_NAMESPACE, WSSE_NAMESPACE } from "../../src/core/namespaces.ts";
import { buildSignedRequest } from "../../src/core/sign.ts";
import { sha256 } from "../../src/core/webcrypto.ts";
import { canonicalizeToBytes } from "../../src/core/xml/c14n.ts";
import { findChild, textContent } from "../../src/core/xml/model.ts";
import { parseXmlDocument } from "../../src/core/xml/parse.ts";
import { getOrThrow } from "../../src/result.ts";
import { brandedHeader, brandedReceipt } from "../helpers.ts";
import { loadPlaygroundP12Signer } from "./p12-helper.ts";

/**
 * Opt-in, no-network integration test: signs a real request with a genuine playground
 * cash-register certificate/key extracted from `caeet/*.p12`, and checks its certificate chain
 * against the bundled playground CA (`caeet/ca_eet-*.crt`) using Node/Bun's `crypto.X509Certificate`.
 *
 * Disabled by default and in CI. Enable with `EET_TEST_P12=1 bun test test/integration`.
 * Requires `openssl` in PATH (see `p12-helper.ts`).
 */
const ENABLED = process.env["EET_TEST_P12"] === "1";

const CAEET_DIR = join(import.meta.dirname, "..", "..", "caeet");

(ENABLED ? describe : describe.skip)("Real playground .p12 signer (opt-in, no network)", () => {
  test("the cash-register certificate chains to the bundled playground CA and its signature verifies", () => {
    const { certificatePem } = loadPlaygroundP12Signer("CZ8551015704");
    const leaf = new X509Certificate(certificatePem);
    const sub = new X509Certificate(
      readFileSync(join(CAEET_DIR, "ca_eet-sub_cert-playground.crt")),
    );
    const root = new X509Certificate(
      readFileSync(join(CAEET_DIR, "ca_eet-root_cert-playground.crt")),
    );

    assert.ok(leaf.checkIssued(sub));
    assert.strictEqual(leaf.verify(sub.publicKey), true);
    assert.ok(sub.checkIssued(root));
    assert.strictEqual(sub.verify(root.publicKey), true);
    assert.strictEqual(root.verify(root.publicKey), true); // root is self-signed

    const now = Date.now();
    assert.ok(leaf.validFromDate.getTime() <= now);
    assert.ok(leaf.validToDate.getTime() >= now);
  });

  test("buildSignedRequest produces a self-consistent digest using the real key/cert", async () => {
    const { signer } = loadPlaygroundP12Signer("CZ8551015704");
    const receipt = brandedReceipt({
      eic_popl: "CZ8551015704",
      id_jednotky: "181",
      id_pokl: "00/2535/CN58",
      porad_cis: "0/2482/IE25",
      dat_trzby: "2027-01-07T22:01:00+01:00",
      celk_trzba: "87988.00",
    });
    const header = brandedHeader({
      uuid: "e23e5a5a-08d7-4a08-844d-2b6c6b60621d",
      sentAt: "2027-01-08T21:19:40+01:00",
      firstSubmission: true,
      verification: true,
    });

    const xml = await buildSignedRequest(receipt, header, signer);
    const root = getOrThrow(parseXmlDocument(xml.replace(/^<\?xml[^>]*\?>/, "")));
    const body = findChild(root, SOAP_NAMESPACE, "Body");
    const soapHeader = findChild(root, SOAP_NAMESPACE, "Header");
    const security = soapHeader && findChild(soapHeader, WSSE_NAMESPACE, "Security");
    const signature = security && findChild(security, DS_NAMESPACE, "Signature");
    const signedInfo = signature && findChild(signature, DS_NAMESPACE, "SignedInfo");
    const reference = signedInfo && findChild(signedInfo, DS_NAMESPACE, "Reference");
    const digestValueEl = reference && findChild(reference, DS_NAMESPACE, "DigestValue");
    if (body === undefined || digestValueEl === undefined) {
      throw new Error("missing soap:Body or ds:DigestValue in signed request");
    }

    const expectedDigest = await sha256(canonicalizeToBytes(body));
    assert.strictEqual(textContent(digestValueEl).trim(), encodeBase64(expectedDigest));
  });
});
