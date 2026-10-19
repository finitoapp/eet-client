import assert from "node:assert/strict";
import * as nodeCrypto from "node:crypto";
import { test } from "node:test";
import {
  brandedReceipt,
  buildPotvrzeniOdpoved,
  buildSignedOdpovedResponse,
  createTestSigner,
  readFixture,
} from "../../test/helpers.ts";
import { decodeBase64 } from "../core/base64.ts";
import { DS_NAMESPACE, SOAP_NAMESPACE, WSSE_NAMESPACE } from "../core/namespaces.ts";
import { canonicalizeToBytes } from "../core/xml/c14n.ts";
import { findChild, parseXmlDocument, textContent } from "../core/xml/index.ts";
import { getOrThrow } from "../result.ts";

// Node implements the same structural API; this is not a React Native runtime test.
test("explicit backend covers PKCS#12 and submit without global crypto or Buffer", async () => {
  const response = await buildSignedOdpovedResponse(
    buildPotvrzeniOdpoved({
      uuid: "12345678-1234-4234-8234-123456789abc",
      receivedAt: "2027-01-07T22:01:05+01:00",
      pok: "987a6be5-6af5-44f3-b4fc-987654321000-ff",
    }),
    await createTestSigner("test-signer.cert.der", "test-signer.key.pk8"),
  );
  // Node Response construction itself requires global Buffer; prepare the fake server first.
  const responses = Array.from({ length: 5 }, () => new Response(response, { status: 200 }));
  const randomUUID = () => "12345678-1234-4234-8234-123456789abc";
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const bufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  Object.defineProperty(globalThis, "Buffer", { configurable: true, value: undefined });
  const assertGlobals = () => {
    assert.equal(globalThis.crypto, undefined);
    assert.equal(globalThis.Buffer, undefined);
  };
  try {
    const { createReactNativeCrypto: factory } = await import("./index.ts");
    const native = factory({ ...nodeCrypto, randomUUID });
    const parsed = getOrThrow(
      await native.parsePkcs12(readFixture("pkcs12-sample.p12"), "test-fixture-password"),
    );
    assert.ok(parsed.privateKey);
    assert.ok(parsed.certificates.length > 0);
    const wrongPassword = await native.parsePkcs12(readFixture("pkcs12-sample.p12"), "wrong");
    assert.equal(wrongPassword.ok, false);
    if (!wrongPassword.ok) assert.equal(wrongPassword.error.type, "Pkcs12InvalidMacError");
    assert.equal(native.importPrivateKey(new Uint8Array([0])).ok, false);
    assert.equal(native.importPublicKey(new Uint8Array([0])).ok, false);

    const key = getOrThrow(native.importPrivateKey(parsed.privateKey.der));
    const cert = readFixture("test-signer.cert.der");
    const signer = native.createSigner(cert, key);
    const publicKey = getOrThrow(native.importPublicKey(readFixture("test-signer.pub.spki.der")));
    const verifier = native.createResponseSignatureVerifier(publicKey, cert);
    const fetchImpl: typeof fetch = async (_url, init) => {
      const request = parseXmlDocument(new TextDecoder().decode(init?.body as Uint8Array));
      const root = getOrThrow(request);
      const header = findChild(root, SOAP_NAMESPACE, "Header");
      assert.ok(header);
      const security = findChild(header, WSSE_NAMESPACE, "Security");
      assert.ok(security);
      const signature = findChild(security, DS_NAMESPACE, "Signature");
      assert.ok(signature);
      const info = findChild(signature, DS_NAMESPACE, "SignedInfo");
      const value = findChild(signature, DS_NAMESPACE, "SignatureValue");
      assert.ok(info && value);
      assert.equal(
        nodeCrypto.verify(
          "RSA-SHA256",
          canonicalizeToBytes(info),
          publicKey,
          decodeBase64(textContent(value)),
        ),
        true,
      );
      const next = responses.shift();
      assert.ok(next);
      return next;
    };
    const receipt = brandedReceipt({
      eic_popl: "CZ8551015704",
      id_jednotky: "181",
      id_pokl: "cash-register",
      porad_cis: "1",
      dat_trzby: "2027-01-07T22:01:00+01:00",
      celk_trzba: "100.00",
    });
    const submit = (responseSignatureVerifier: typeof verifier) =>
      native
        .createEetClient({
          endpoint: "https://example.test/eet",
          signer,
          responseSignatureVerifier,
          fetch: fetchImpl,
        })
        .submit(receipt, { firstSubmission: true });
    const result = getOrThrow(await submit(verifier));
    assert.equal(result.status, "accepted");
    let customCalls = 0;
    assert.equal(
      getOrThrow(
        await submit({
          async verify(input) {
            customCalls++;
            return verifier.verify(input);
          },
        }),
      ).status,
      "accepted",
    );
    assert.equal(customCalls, 1);
    assert.equal(
      (
        await submit({
          async verify() {
            return false;
          },
        })
      ).ok,
      false,
    );
    assert.equal(
      (await submit(native.createResponseSignatureVerifier(publicKey, new Uint8Array([0])))).ok,
      false,
    );
    const wrongPublicKey = getOrThrow(
      native.importPublicKey(readFixture("test-signer-other.pub.spki.der")),
    );
    assert.equal(
      (await submit(native.createResponseSignatureVerifier(wrongPublicKey, cert))).ok,
      false,
    );
    let tamperedVerifierCalls = 0;
    assert.equal(
      (
        await native.parseAndVerifyResponse(response.replace("987a6be5", "887a6be5"), {
          httpStatus: 200,
          responseSignatureVerifier: {
            async verify() {
              tamperedVerifierCalls++;
              return true;
            },
          },
        })
      ).ok,
      false,
    );
    assert.equal(tamperedVerifierCalls, 0);
    assertGlobals();
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
    if (bufferDescriptor) Object.defineProperty(globalThis, "Buffer", bufferDescriptor);
    else Reflect.deleteProperty(globalThis, "Buffer");
  }
});

test("independent adapters retain their own backend", async () => {
  const { createReactNativeCrypto } = await import("./index.ts");
  const first = createReactNativeCrypto(nodeCrypto);
  const second = createReactNativeCrypto({ ...nodeCrypto, randomUUID: () => "test-uuid" });
  assert.equal(second.cryptoBackend.randomUuid(), "test-uuid");
  assert.notEqual(first.cryptoBackend.randomUuid(), "test-uuid");
});
