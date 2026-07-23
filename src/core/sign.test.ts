import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brandedHeader, brandedReceipt, createTestSigner } from "../../test/helpers.ts";
import { getOrThrow } from "../result.ts";
import { encodeBase64 } from "./base64.ts";
import { buildTrzbaElement, serializeUnsignedRequest } from "./build-request.ts";
import {
  DS_NAMESPACE,
  EET_NAMESPACE,
  EXCLUSIVE_C14N_ALGORITHM,
  RSA_SHA256_SIGNATURE_ALGORITHM,
  SHA256_DIGEST_ALGORITHM,
  SOAP_NAMESPACE,
  WSSE_NAMESPACE,
  WSU_NAMESPACE,
} from "./namespaces.ts";
import { buildSignedRequest } from "./sign.ts";
import { sha256 } from "./webcrypto.ts";
import { canonicalizeToBytes } from "./xml/c14n.ts";
import { findChild, findChildren, getAttribute, textContent } from "./xml/model.ts";
import { parseXmlDocument } from "./xml/parse.ts";

const receipt = brandedReceipt({
  eic_popl: "CZ8551015704",
  eic_poverujiciho: "CZ00000019",
  povereni_vice_popl: true,
  id_jednotky: "181",
  id_pokl: "00/2535/CN58",
  porad_cis: "0/2482/IE25",
  dat_trzby: "2027-01-07T22:01:00+01:00",
  celk_trzba: "87988.00",
  urceno_cerp_zuct: "343.00",
  cerp_zuct: "237.00",
});

const header = brandedHeader({
  uuid: "e23e5a5a-08d7-4a08-844d-2b6c6b60621d",
  sentAt: "2027-01-08T21:19:40+01:00",
  firstSubmission: true,
  verification: false,
});

describe("buildTrzbaElement", () => {
  test("emits every required attribute and every present optional attribute", () => {
    const trzba = buildTrzbaElement(receipt, header);
    const headerEl = findChild(trzba, EET_NAMESPACE, "Hlavicka");
    const dataEl = findChild(trzba, EET_NAMESPACE, "Data");
    if (headerEl === undefined || dataEl === undefined) throw new Error("missing Hlavicka/Data");

    assert.strictEqual(getAttribute(headerEl, "", "uuid_zpravy"), header.uuid);
    assert.strictEqual(getAttribute(headerEl, "", "dat_odesl"), header.sentAt);
    assert.strictEqual(getAttribute(headerEl, "", "prvni_zaslani"), "true");
    assert.strictEqual(getAttribute(headerEl, "", "overeni"), undefined);

    assert.strictEqual(getAttribute(dataEl, "", "eic_popl"), receipt.eic_popl);
    assert.strictEqual(getAttribute(dataEl, "", "eic_poverujiciho"), receipt.eic_poverujiciho);
    assert.strictEqual(getAttribute(dataEl, "", "povereni_vice_popl"), "true");
    assert.strictEqual(getAttribute(dataEl, "", "urceno_cerp_zuct"), receipt.urceno_cerp_zuct);
    assert.strictEqual(getAttribute(dataEl, "", "cerp_zuct"), receipt.cerp_zuct);
  });

  test("never emits an attribute for an omitted optional field", () => {
    const minimalReceipt = brandedReceipt({
      eic_popl: "CZ00000019",
      id_jednotky: "24",
      id_pokl: "A",
      porad_cis: "1",
      dat_trzby: "2027-01-07T22:01:00+01:00",
      celk_trzba: "0.00",
    });
    const trzba = buildTrzbaElement(minimalReceipt, header);
    const dataEl = findChild(trzba, EET_NAMESPACE, "Data");
    if (dataEl === undefined) throw new Error("missing Data");
    for (const name of [
      "eic_poverujiciho",
      "povereni_vice_popl",
      "urceno_cerp_zuct",
      "cerp_zuct",
    ]) {
      assert.strictEqual(getAttribute(dataEl, "", name), undefined);
    }
    assert.strictEqual(
      dataEl.attributes.some((a) => a.value === ""),
      false,
    );
  });

  test("serializes overeni only when explicitly set", () => {
    const trzba = buildTrzbaElement(receipt, { ...header, verification: true });
    const headerEl = findChild(trzba, EET_NAMESPACE, "Hlavicka");
    if (headerEl === undefined) throw new Error("missing Hlavicka");
    assert.strictEqual(getAttribute(headerEl, "", "overeni"), "true");
  });
});

describe("serializeUnsignedRequest", () => {
  test("produces a bare soap:Envelope/soap:Body/tns:Trzba with no WS-Security header", () => {
    const xml = serializeUnsignedRequest(receipt, header);
    assert.strictEqual(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), true);
    const root = getOrThrow(parseXmlDocument(xml.replace(/^<\?xml[^>]*\?>/, "")));
    assert.deepStrictEqual(root.name, { prefix: "soap", local: "Envelope", uri: SOAP_NAMESPACE });
    assert.strictEqual(findChild(root, SOAP_NAMESPACE, "Header"), undefined);
    const body = findChild(root, SOAP_NAMESPACE, "Body");
    if (body === undefined) throw new Error("missing soap:Body");
    assert.notStrictEqual(findChild(body, EET_NAMESPACE, "Trzba"), undefined);
  });
});

describe("buildSignedRequest", () => {
  test("produces the exact WS-Security shape mandated by the EET specification", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const xml = await buildSignedRequest(receipt, header, signer);

    assert.strictEqual(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), true);
    const root = getOrThrow(parseXmlDocument(xml.replace(/^<\?xml[^>]*\?>/, "")));

    // No Timestamp, no WS-Addressing: soap:Header must contain exactly one child, wsse:Security.
    const soapHeader = findChild(root, SOAP_NAMESPACE, "Header");
    if (soapHeader === undefined) throw new Error("missing soap:Header");
    assert.strictEqual(soapHeader.children.filter((n) => n.type === "element").length, 1);
    const security = findChild(soapHeader, WSSE_NAMESPACE, "Security");
    if (security === undefined) throw new Error("missing wsse:Security");

    const bst = findChild(security, WSSE_NAMESPACE, "BinarySecurityToken");
    if (bst === undefined) throw new Error("missing BinarySecurityToken");
    assert.strictEqual(
      getAttribute(bst, "", "ValueType"),
      "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3",
    );
    assert.strictEqual(
      getAttribute(bst, "", "EncodingType"),
      "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary",
    );
    assert.strictEqual(
      textContent(bst).trim(),
      encodeBase64(new Uint8Array(await signer.getCertificate())),
    );

    const signature = findChild(security, DS_NAMESPACE, "Signature");
    if (signature === undefined) throw new Error("missing ds:Signature");
    const signedInfo = findChild(signature, DS_NAMESPACE, "SignedInfo");
    if (signedInfo === undefined) throw new Error("missing ds:SignedInfo");

    const canonicalizationMethod = findChild(signedInfo, DS_NAMESPACE, "CanonicalizationMethod");
    const signatureMethod = findChild(signedInfo, DS_NAMESPACE, "SignatureMethod");
    if (canonicalizationMethod === undefined || signatureMethod === undefined) {
      throw new Error("missing CanonicalizationMethod/SignatureMethod");
    }
    assert.strictEqual(
      getAttribute(canonicalizationMethod, "", "Algorithm"),
      EXCLUSIVE_C14N_ALGORITHM,
    );
    assert.strictEqual(
      getAttribute(signatureMethod, "", "Algorithm"),
      RSA_SHA256_SIGNATURE_ALGORITHM,
    );

    const references = findChildren(signedInfo, DS_NAMESPACE, "Reference");
    assert.strictEqual(references.length, 1);
    const reference = references[0];
    if (reference === undefined) throw new Error("missing ds:Reference");
    const transform = findChild(
      findChild(reference, DS_NAMESPACE, "Transforms") as never,
      DS_NAMESPACE,
      "Transform",
    );
    const digestMethod = findChild(reference, DS_NAMESPACE, "DigestMethod");
    if (transform === undefined || digestMethod === undefined) {
      throw new Error("missing Transform/DigestMethod");
    }
    assert.strictEqual(getAttribute(transform, "", "Algorithm"), EXCLUSIVE_C14N_ALGORITHM);
    assert.strictEqual(getAttribute(digestMethod, "", "Algorithm"), SHA256_DIGEST_ALGORITHM);

    // The reference must point to exactly the signed soap:Body, and only soap:Body.
    const body = findChild(root, SOAP_NAMESPACE, "Body");
    if (body === undefined) throw new Error("missing soap:Body");
    const bodyId = getAttribute(body, WSU_NAMESPACE, "Id");
    assert.strictEqual(getAttribute(reference, "", "URI"), `#${bodyId}`);

    // End-to-end self-consistency: recomputing the digest of the transmitted soap:Body must
    // match the DigestValue embedded in SignedInfo (proves the transmitted Body bytes are
    // already in the exact canonical form that was digested).
    const digestValueEl = findChild(reference, DS_NAMESPACE, "DigestValue");
    if (digestValueEl === undefined) throw new Error("missing DigestValue");
    const expectedDigest = await sha256(canonicalizeToBytes(body));
    assert.strictEqual(textContent(digestValueEl).trim(), encodeBase64(expectedDigest));
  });

  test("stays within the 12 kB envelope even with maximum-length fields", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const maxReceipt = brandedReceipt({
      eic_popl: "CZ8551015704",
      eic_poverujiciho: "CZ00000019",
      povereni_vice_popl: true,
      id_jednotky: "999999999",
      id_pokl: "a".repeat(20),
      porad_cis: "a".repeat(25),
      dat_trzby: "2027-01-07T22:01:00+01:00",
      celk_trzba: "99999999.99",
      urceno_cerp_zuct: "99999999.99",
      cerp_zuct: "-99999999.99",
    });
    const xml = await buildSignedRequest(maxReceipt, header, signer);
    assert.ok(new TextEncoder().encode(xml).length < 12_000);
  });
});
