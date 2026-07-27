import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFixture } from "../../test/helpers.ts";
import { concatBytes } from "../core/bytes.ts";
import { isOk } from "../result.ts";
import { isPkcs12Error } from "./errors.ts";
import { derivePkcs12Bits, PKCS12_KDF_ID } from "./kdf.ts";
import { parsePkcs12, pickPrivateKeyCertificate } from "./parse.ts";

// Minimal hand-rolled DER encoders (short-form lengths only — every value built below is well
// under 127 bytes) used solely to construct one small, fully synthetic, unencrypted-AuthSafe PFX
// fixture in this test file. src/pkcs12/ deliberately has no ASN.1 *encoder* (see der.ts's doc
// comment) since the library itself never needs to re-encode anything; this is test-only.
function derTlv(tag: number, content: Uint8Array): Uint8Array {
  if (content.length > 127) throw new Error("test helper only supports short-form DER lengths");
  return concatBytes(new Uint8Array([tag, content.length]), content);
}
function derSequence(...children: Uint8Array[]): Uint8Array {
  return derTlv(0x30, concatBytes(...children));
}
function derExplicit0(content: Uint8Array): Uint8Array {
  return derTlv(0xa0, content);
}
function derOctetString(content: Uint8Array): Uint8Array {
  return derTlv(0x04, content);
}
function derInteger(value: number): Uint8Array {
  if (value < 0 || value > 127)
    throw new Error("test helper only supports small non-negative integers");
  return derTlv(0x02, new Uint8Array([value]));
}
function derOid(dotted: string): Uint8Array {
  const arcs = dotted.split(".").map(Number);
  const first = (arcs[0] as number) * 40 + (arcs[1] as number);
  const bytes: number[] = [first];
  for (const arc of arcs.slice(2)) {
    const group = [arc & 0x7f];
    let v = Math.floor(arc / 128);
    while (v > 0) {
      group.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    bytes.push(...group);
  }
  return derTlv(0x06, new Uint8Array(bytes));
}

/** Builds a minimal, unencrypted-AuthSafe PFX containing exactly one SafeBag of `bagIdOid`, with a correctly-computed MAC — so `parsePkcs12` gets all the way to `collectSafeBags`'s bagId dispatch. */
async function buildSyntheticPfx(password: string, bagIdOid: string): Promise<Uint8Array> {
  const safeBag = derSequence(
    derOid(bagIdOid),
    derExplicit0(derOctetString(new Uint8Array([0x00]))),
  );
  const safeContents = derSequence(safeBag);
  const innerContentInfo = derSequence(
    derOid("1.2.840.113549.1.7.1"),
    derExplicit0(derOctetString(safeContents)),
  );
  const authenticatedSafe = derSequence(innerContentInfo);
  const authSafeContentInfo = derSequence(
    derOid("1.2.840.113549.1.7.1"),
    derExplicit0(derOctetString(authenticatedSafe)),
  );

  const macSalt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const iterations = 1;
  const macKey = await derivePkcs12Bits(password, macSalt, iterations, PKCS12_KDF_ID.mac, 20);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    macKey as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, authenticatedSafe as BufferSource),
  );
  const digestAlgorithm = derSequence(derOid("1.3.14.3.2.26"), derTlv(0x05, new Uint8Array([])));
  const macData = derSequence(
    derSequence(digestAlgorithm, derOctetString(mac)),
    derOctetString(macSalt),
    derInteger(iterations),
  );

  return derSequence(derInteger(3), authSafeContentInfo, macData);
}

const RSA_SHA256: RsaHashedImportParams = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

// Built via:
//   openssl pkcs12 -export -legacy -in <test-signer.cert.der as PEM> -inkey <test-signer.key.pk8 as PEM> \
//     -passout file:... -name test-signer -out pkcs12-sample.p12
// from this repo's own throwaway `test-signer.cert.der`/`test-signer.key.pk8` fixtures (never
// derived from the real `caeet/*.p12` playground files) — same shape (RC2-40 cert bag, 3-key
// 3DES shrouded key bag, SHA-1 MacData) real GFŘ-issued `.p12` files use. Re-extracting the cert
// and key from this fixture via `openssl pkcs12 -legacy` reproduces `test-signer.cert.der`/
// `test-signer.key.pk8` byte-for-byte, confirmed while authoring this fixture — so this test
// compares against those existing fixtures directly instead of adding new "expected" ones.
const PASSWORD = "test-fixture-password";

describe("parsePkcs12", () => {
  test("parses the sample fixture, matching the original cert/key fixtures byte-for-byte", async () => {
    const data = readFixture("pkcs12-sample.p12");
    const result = await parsePkcs12(data, PASSWORD);
    assert.ok(isOk(result), `expected Ok, got ${JSON.stringify(!isOk(result) && result.error)}`);
    if (!isOk(result)) return;

    assert.strictEqual(result.value.certificates.length, 1);
    assert.deepStrictEqual(result.value.certificates[0]?.der, readFixture("test-signer.cert.der"));
    assert.deepStrictEqual(result.value.privateKey?.der, readFixture("test-signer.key.pk8"));
  });

  test("the certificate carries the friendlyName set via `-name` at export time", async () => {
    const result = await parsePkcs12(readFixture("pkcs12-sample.p12"), PASSWORD);
    assert.ok(isOk(result));
    if (!isOk(result)) return;
    assert.strictEqual(result.value.certificates[0]?.friendlyName, "test-signer");
  });

  test("the certificate and private key share the same localKeyId", async () => {
    const result = await parsePkcs12(readFixture("pkcs12-sample.p12"), PASSWORD);
    assert.ok(isOk(result));
    if (!isOk(result)) return;
    const certKeyId = result.value.certificates[0]?.localKeyId;
    const keyKeyId = result.value.privateKey?.localKeyId;
    assert.ok(certKeyId !== undefined && keyKeyId !== undefined);
    assert.deepStrictEqual(certKeyId, keyKeyId);
  });

  test("the decrypted private key imports via Web Crypto and can sign", async () => {
    const result = await parsePkcs12(readFixture("pkcs12-sample.p12"), PASSWORD);
    assert.ok(isOk(result));
    if (!isOk(result)) return;
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      result.value.privateKey?.der as BufferSource,
      RSA_SHA256,
      false,
      ["sign"],
    );
    const data = new TextEncoder().encode("hello pkcs12");
    const signature = await crypto.subtle.sign(RSA_SHA256.name, privateKey, data);

    const publicKey = await crypto.subtle.importKey(
      "spki",
      readFixture("test-signer.pub.spki.der") as BufferSource,
      RSA_SHA256,
      false,
      ["verify"],
    );
    assert.strictEqual(
      await crypto.subtle.verify(RSA_SHA256.name, publicKey, signature, data),
      true,
    );
  });

  test("returns Pkcs12InvalidMacError for the wrong password", async () => {
    const result = await parsePkcs12(readFixture("pkcs12-sample.p12"), "wrong password");
    assert.ok(!isOk(result));
    if (isOk(result)) return;
    assert.ok(isPkcs12Error(result.error, "Pkcs12InvalidMacError"));
  });

  test("returns Pkcs12MalformedError for data that isn't DER at all", async () => {
    const result = await parsePkcs12(new Uint8Array([1, 2, 3, 4]), PASSWORD);
    assert.ok(!isOk(result));
    if (isOk(result)) return;
    assert.ok(isPkcs12Error(result.error, "Pkcs12MalformedError"));
  });

  test("returns Pkcs12MalformedError for a truncated (otherwise valid-looking) file", async () => {
    const data = readFixture("pkcs12-sample.p12");
    const result = await parsePkcs12(data.subarray(0, data.length - 50), PASSWORD);
    assert.ok(!isOk(result));
    if (isOk(result)) return;
    assert.ok(isPkcs12Error(result.error, "Pkcs12MalformedError"));
  });

  test("returns Pkcs12MalformedError (not a silently-empty Ok) for an unrecognized SafeBag type", async () => {
    // crlBag (1.2.840.113549.1.12.10.1.4) — a real PKCS#12 bag type, just not one this parser
    // implements (only certBag/keyBag/pkcs8ShroudedKeyBag are). Passes MAC verification (the MAC
    // is computed for real, over the real authSafe bytes), so this specifically exercises
    // collectSafeBags's bagId dispatch rather than the MAC check.
    const data = await buildSyntheticPfx(PASSWORD, "1.2.840.113549.1.12.10.1.4");
    const result = await parsePkcs12(data, PASSWORD);
    assert.ok(
      !isOk(result),
      "expected Err, got Ok — an unrecognized bag type was silently skipped",
    );
    if (isOk(result)) return;
    assert.ok(isPkcs12Error(result.error, "Pkcs12MalformedError"));
    assert.match(result.error.message, /1\.2\.840\.113549\.1\.12\.10\.1\.4/);
  });
});

describe("pickPrivateKeyCertificate", () => {
  test("picks the certificate matching the private key's localKeyId", async () => {
    const result = await parsePkcs12(readFixture("pkcs12-sample.p12"), PASSWORD);
    assert.ok(isOk(result));
    if (!isOk(result)) return;
    const picked = pickPrivateKeyCertificate(result.value);
    assert.deepStrictEqual(picked?.der, readFixture("test-signer.cert.der"));
  });

  test("falls back to the first certificate when there's no localKeyId to match", () => {
    const certA = { der: new Uint8Array([1]) };
    const certB = { der: new Uint8Array([2]) };
    const picked = pickPrivateKeyCertificate({
      certificates: [certA, certB],
      privateKey: { der: new Uint8Array([9]) },
    });
    assert.strictEqual(picked, certA);
  });

  test("returns undefined when there are no certificates", () => {
    const picked = pickPrivateKeyCertificate({ certificates: [], privateKey: undefined });
    assert.strictEqual(picked, undefined);
  });

  test("returns undefined (not a guess) when the private key's localKeyId matches no certificate", () => {
    const certA = { der: new Uint8Array([1]), localKeyId: new Uint8Array([0xaa]) };
    const certB = { der: new Uint8Array([2]), localKeyId: new Uint8Array([0xbb]) };
    const picked = pickPrivateKeyCertificate({
      certificates: [certA, certB],
      privateKey: { der: new Uint8Array([9]), localKeyId: new Uint8Array([0xcc]) },
    });
    assert.strictEqual(picked, undefined);
  });
});
