import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildChybaOdpoved,
  buildPotvrzeniOdpoved,
  buildSignedOdpovedResponse,
  buildSoapFaultResponse,
  buildUnsignedOdpovedResponse,
  createTestSigner,
  readFixture,
} from "../../test/helpers.ts";
import { getOrThrow } from "../result.ts";
import type { ResponseSignatureVerifier } from "../types/verifier.ts";
import { createCryptoKeyResponseSignatureVerifier } from "./crypto-adapters.ts";
import { parseAndVerifyResponse } from "./parse-response.ts";

const ALWAYS_ACCEPT: ResponseSignatureVerifier = { verify: async () => true };
const ALWAYS_REJECT: ResponseSignatureVerifier = { verify: async () => false };

async function pinnedVerifierForTestSigner(): Promise<ResponseSignatureVerifier> {
  return createCryptoKeyResponseSignatureVerifier(
    readFixture("test-signer.pub.spki.der"),
    readFixture("test-signer.cert.der"),
  );
}

describe("parseAndVerifyResponse: accepted (Potvrzeni)", () => {
  test("production confirmation with a valid signature is accepted", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const xml = await buildSignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      }),
      signer,
    );

    const outcome = getOrThrow(
      await parseAndVerifyResponse(xml, {
        httpStatus: 200,
        responseSignatureVerifier: await pinnedVerifierForTestSigner(),
      }),
    );

    assert.deepStrictEqual(outcome, {
      status: "accepted",
      pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      uuid: "123e4567-e89b-42d3-a456-426655440000",
      receivedAt: "2027-03-04T18:25:21+01:00",
      test: false,
      warnings: [],
      httpStatus: 200,
    });
  });

  test("playground confirmation (test=true) with warnings is accepted", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const xml = await buildSignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-ff",
        test: true,
        warnings: [
          { code: 1, message: "EIC poplatnika v datove zprave se neshoduje s EIC v certifikatu" },
          { code: 2, message: "Chybny format EIC poverujiciho poplatnika" },
        ],
      }),
      signer,
    );

    const outcome = getOrThrow(
      await parseAndVerifyResponse(xml, {
        httpStatus: 200,
        globalTransactionId: "trace-42",
        responseSignatureVerifier: await pinnedVerifierForTestSigner(),
      }),
    );

    assert.strictEqual(outcome.status, "accepted");
    if (outcome.status !== "accepted") throw new Error("unreachable");
    assert.strictEqual(outcome.test, true);
    assert.deepStrictEqual(outcome.warnings, [
      { code: 1, message: "EIC poplatnika v datove zprave se neshoduje s EIC v certifikatu" },
      { code: 2, message: "Chybny format EIC poverujiciho poplatnika" },
    ]);
    assert.strictEqual(outcome.globalTransactionId, "trace-42");
  });

  test("rejects when no responseSignatureVerifier resolves the signature as valid", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const xml = await buildSignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      }),
      signer,
    );

    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 200,
      responseSignatureVerifier: ALWAYS_REJECT,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetSignatureError");
  });

  test("rejects when the responseSignatureVerifier throws", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const xml = await buildSignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      }),
      signer,
    );
    const throwingVerifier: ResponseSignatureVerifier = {
      verify: async () => {
        throw new Error("boom");
      },
    };

    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 200,
      responseSignatureVerifier: throwingVerifier,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetSignatureError");
  });

  test("rejects a Potvrzeni response with no WS-Security header at all", async () => {
    const xml = buildUnsignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      }),
    );

    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 200,
      responseSignatureVerifier: ALWAYS_ACCEPT,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetSignatureError");
  });

  test("rejects when the signed Body is tampered with after signing (digest mismatch)", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const xml = await buildSignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      }),
      signer,
    );
    const tampered = xml.replace(
      "987a6be5-6af5-44f3-b4fc-987654321000-02",
      "987a6be5-6af5-44f3-b4fc-987654321999-02",
    );

    const result = await parseAndVerifyResponse(tampered, {
      httpStatus: 200,
      responseSignatureVerifier: await pinnedVerifierForTestSigner(),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetSignatureError");
  });

  test("rejects when the attached certificate does not match the pinned trust anchor (wrong cert)", async () => {
    const signer = await createTestSigner(
      "test-signer-other.cert.der",
      "test-signer-other.key.pk8",
    );
    const xml = await buildSignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      }),
      signer,
    );

    // Verifier is pinned to test-signer.cert.der, but the response was signed by the *other* cert.
    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 200,
      responseSignatureVerifier: await pinnedVerifierForTestSigner(),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetSignatureError");
  });

  test("still resolves the correct certificate when an unreferenced BinarySecurityToken precedes it", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const otherSigner = await createTestSigner(
      "test-signer-other.cert.der",
      "test-signer-other.key.pk8",
    );
    const buildOdpoved = () =>
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      });

    const xml = await buildSignedOdpovedResponse(buildOdpoved(), signer);
    const otherXml = await buildSignedOdpovedResponse(buildOdpoved(), otherSigner);

    const decoyTokenMatch = otherXml.match(
      /<wsse:BinarySecurityToken[\s\S]*?<\/wsse:BinarySecurityToken>/,
    );
    if (decoyTokenMatch === null) throw new Error("test setup: could not extract decoy token");
    const decoyToken = decoyTokenMatch[0].replace('wsu:Id="X509Token"', 'wsu:Id="Decoy"');

    // A decoy token (unrelated cert) placed *before* the real one, in document order, must not
    // affect which certificate gets checked — only the one ds:KeyInfo actually references by Id.
    const tampered = xml.replace(
      "<wsse:BinarySecurityToken",
      `${decoyToken}<wsse:BinarySecurityToken`,
    );

    const result = await parseAndVerifyResponse(tampered, {
      httpStatus: 200,
      responseSignatureVerifier: await pinnedVerifierForTestSigner(),
    });
    assert.strictEqual(result.ok, true);
  });

  test("rejects when ds:KeyInfo references a BinarySecurityToken Id that isn't present", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const xml = await buildSignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      }),
      signer,
    );
    const tampered = xml.replace('URI="#X509Token"', 'URI="#DoesNotExist"');

    const result = await parseAndVerifyResponse(tampered, {
      httpStatus: 200,
      responseSignatureVerifier: await pinnedVerifierForTestSigner(),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetSignatureError");
  });

  test("rejects when ds:Signature is missing KeyInfo", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const xml = await buildSignedOdpovedResponse(
      buildPotvrzeniOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        receivedAt: "2027-03-04T18:25:21+01:00",
        pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
      }),
      signer,
    );
    const tampered = xml.replace(/<ds:KeyInfo>[\s\S]*?<\/ds:KeyInfo>/, "");

    const result = await parseAndVerifyResponse(tampered, {
      httpStatus: 200,
      responseSignatureVerifier: await pinnedVerifierForTestSigner(),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetSignatureError");
  });

  test("rejects a Potvrzeni response missing uuid_zpravy/dat_prij", async () => {
    const signer = await createTestSigner("test-signer.cert.der", "test-signer.key.pk8");
    const odpoved = buildPotvrzeniOdpoved({
      uuid: "",
      receivedAt: "",
      pok: "987a6be5-6af5-44f3-b4fc-987654321000-02",
    });
    // Strip the empty attributes entirely to simulate a genuinely absent uuid_zpravy/dat_prij.
    const header = odpoved.children[0];
    if (header?.type === "element") header.attributes = [];
    const xml = await buildSignedOdpovedResponse(odpoved, signer);

    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 200,
      responseSignatureVerifier: await pinnedVerifierForTestSigner(),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetResponseSchemaError");
  });
});

describe("parseAndVerifyResponse: verification mode (Chyba kod=0)", () => {
  test("kod=0 maps to a verification outcome, never an Err", async () => {
    const xml = buildUnsignedOdpovedResponse(
      buildChybaOdpoved({
        uuid: "123e4567-e89b-42d3-a456-426655440000",
        code: 0,
        message: "Datovou zpravu evidovane trzby v overovacim modu se podarilo zpracovat",
        test: true,
        warnings: [
          {
            code: 4,
            message: "Datum a cas uskutecneni trzby je novejsi nez datum a cas prijeti zpravy",
          },
        ],
      }),
    );

    const outcome = getOrThrow(
      await parseAndVerifyResponse(xml, {
        httpStatus: 200,
        responseSignatureVerifier: ALWAYS_REJECT, // must not even be consulted
      }),
    );

    assert.deepStrictEqual(outcome, {
      status: "verification",
      uuid: "123e4567-e89b-42d3-a456-426655440000",
      test: true,
      warnings: [
        {
          code: 4,
          message: "Datum a cas uskutecneni trzby je novejsi nez datum a cas prijeti zpravy",
        },
      ],
      httpStatus: 200,
    });
  });
});

describe("parseAndVerifyResponse: rejected (Chyba, nonzero kod)", () => {
  test("a nonzero error code maps to a rejected outcome with code/message/rejectedAt", async () => {
    const xml = buildUnsignedOdpovedResponse(
      buildChybaOdpoved({
        rejectedAt: "2027-03-04T18:25:21+01:00",
        code: 7,
        message: "Datova zprava je prilis velka",
      }),
    );

    const outcome = getOrThrow(
      await parseAndVerifyResponse(xml, {
        httpStatus: 200,
        responseSignatureVerifier: ALWAYS_REJECT,
      }),
    );

    assert.deepStrictEqual(outcome, {
      status: "rejected",
      code: 7,
      message: "Datova zprava je prilis velka",
      test: false,
      warnings: [],
      rejectedAt: "2027-03-04T18:25:21+01:00",
      httpStatus: 200,
    });
  });

  test("a negative error code (temporary technical error) is a rejected outcome", async () => {
    const xml = buildUnsignedOdpovedResponse(
      buildChybaOdpoved({
        code: -1,
        message: "Docasna technicka chyba zpracovani - odeslete prosim datovou zpravu pozdeji",
      }),
    );
    const outcome = getOrThrow(
      await parseAndVerifyResponse(xml, {
        httpStatus: 200,
        responseSignatureVerifier: ALWAYS_REJECT,
      }),
    );
    assert.strictEqual(outcome.status, "rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    assert.strictEqual(outcome.code, -1);
  });

  test("carries warnings through on a rejected outcome instead of silently dropping them", async () => {
    const xml = buildUnsignedOdpovedResponse(
      buildChybaOdpoved({
        code: 7,
        message: "Datova zprava je prilis velka",
        warnings: [{ code: 4, message: "Datum a cas uskutecneni trzby je novejsi" }],
      }),
    );
    const outcome = getOrThrow(
      await parseAndVerifyResponse(xml, {
        httpStatus: 200,
        responseSignatureVerifier: ALWAYS_REJECT,
      }),
    );
    assert.strictEqual(outcome.status, "rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    assert.deepStrictEqual(outcome.warnings, [
      { code: 4, message: "Datum a cas uskutecneni trzby je novejsi" },
    ]);
  });

  test("caps warnings at 10 and rejects an 11th as a schema violation", async () => {
    const warnings = Array.from({ length: 10 }, (_, i) => ({ code: i + 1, message: `w${i + 1}` }));
    const okXml = buildUnsignedOdpovedResponse(
      buildChybaOdpoved({ code: 0, message: "ok", warnings }),
    );
    const okOutcome = getOrThrow(
      await parseAndVerifyResponse(okXml, {
        httpStatus: 200,
        responseSignatureVerifier: ALWAYS_REJECT,
      }),
    );
    assert.strictEqual(okOutcome.status, "verification");
    if (okOutcome.status !== "verification") throw new Error("unreachable");
    assert.strictEqual(okOutcome.warnings.length, 10);

    const tooManyXml = buildUnsignedOdpovedResponse(
      buildChybaOdpoved({
        code: 0,
        message: "ok",
        warnings: [...warnings, { code: 11, message: "w11" }],
      }),
    );
    const result = await parseAndVerifyResponse(tooManyXml, {
      httpStatus: 200,
      responseSignatureVerifier: ALWAYS_REJECT,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetResponseSchemaError");
  });
});

describe("parseAndVerifyResponse: <Chyba>/<Varovani> text length limit (MAX_MESSAGE_TEXT_LENGTH)", () => {
  test("accepts Chyba text at exactly the 100-character limit", async () => {
    const message = "a".repeat(100);
    const xml = buildUnsignedOdpovedResponse(buildChybaOdpoved({ code: -1, message }));
    const outcome = getOrThrow(
      await parseAndVerifyResponse(xml, {
        httpStatus: 200,
        responseSignatureVerifier: ALWAYS_REJECT,
      }),
    );
    assert.strictEqual(outcome.status, "rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    assert.strictEqual(outcome.message.length, 100);
  });

  test("rejects Chyba text one character over the limit as a schema violation", async () => {
    const message = "a".repeat(101);
    const xml = buildUnsignedOdpovedResponse(buildChybaOdpoved({ code: -1, message }));
    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 200,
      responseSignatureVerifier: ALWAYS_REJECT,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetResponseSchemaError");
  });

  test("rejects Varovani text one character over the limit as a schema violation", async () => {
    const xml = buildUnsignedOdpovedResponse(
      buildChybaOdpoved({
        code: 0,
        message: "ok",
        warnings: [{ code: 1, message: "a".repeat(101) }],
      }),
    );
    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 200,
      responseSignatureVerifier: ALWAYS_REJECT,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetResponseSchemaError");
  });
});

describe("parseAndVerifyResponse: SOAP Fault and malformed responses", () => {
  test("a SOAP Fault is surfaced as EetSoapFaultError with fault code/string", async () => {
    const xml = buildSoapFaultResponse("soap:Server", "Internal error");
    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 500,
      responseSignatureVerifier: ALWAYS_REJECT,
    });
    assert.strictEqual(result.ok, false);
    assert.partialDeepStrictEqual(!result.ok && result.error, {
      type: "EetSoapFaultError",
      faultCode: "soap:Server",
      faultString: "Internal error",
      httpStatus: 500,
    });
  });

  test("invalid XML on a non-2xx status is an EetHttpError, not EetXmlError", async () => {
    const result = await parseAndVerifyResponse("<html>not xml at all", {
      httpStatus: 502,
      responseSignatureVerifier: ALWAYS_REJECT,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetHttpError");
  });

  test("invalid XML on a 2xx status is an EetXmlError", async () => {
    const result = await parseAndVerifyResponse("not xml at all", {
      httpStatus: 200,
      responseSignatureVerifier: ALWAYS_REJECT,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("a response with neither Potvrzeni nor Chyba is a schema error", async () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body><tns:Odpoved xmlns:tns="http://fs.gov.cz/eet/schema/v4">' +
      '<tns:Hlavicka uuid_zpravy="123e4567-e89b-42d3-a456-426655440000"/>' +
      "</tns:Odpoved></soap:Body></soap:Envelope>";
    const result = await parseAndVerifyResponse(xml, {
      httpStatus: 200,
      responseSignatureVerifier: ALWAYS_REJECT,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetResponseSchemaError");
  });
});
