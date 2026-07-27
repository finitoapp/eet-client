import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseEetReceiptData, parseHeader } from "../src/builtin/validate.ts";
import { decodeBase64, encodeBase64 } from "../src/core/base64.ts";
import { createCryptoKeySigner } from "../src/core/crypto-adapters.ts";
import {
  BINARY_SECURITY_TOKEN_ENCODING_TYPE,
  BINARY_SECURITY_TOKEN_VALUE_TYPE,
  DS_NAMESPACE,
  EET_NAMESPACE,
  EXCLUSIVE_C14N_ALGORITHM,
  RSA_SHA256_SIGNATURE_ALGORITHM,
  SHA256_DIGEST_ALGORITHM,
  SOAP_NAMESPACE,
  WSSE_NAMESPACE,
  WSU_NAMESPACE,
} from "../src/core/namespaces.ts";
import { sha256 } from "../src/core/webcrypto.ts";
import { canonicalizeToString } from "../src/core/xml/c14n.ts";
import {
  findChild,
  getAttribute,
  textContent,
  type XmlAttribute,
  type XmlElement,
  xmlElement,
  xmlText,
} from "../src/core/xml/model.ts";
import { parseXmlDocument } from "../src/core/xml/parse.ts";
import { getOrThrow } from "../src/result.ts";
import type { EetHeader, EetHeaderInput } from "../src/types/header.ts";
import type { EetReceiptData, EetReceiptDataInput } from "../src/types/receipt.ts";
import type { EetSigner } from "../src/types/signer.ts";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const REFERENCE_SAMPLES_DIR = join(import.meta.dirname, "..", "docs", "reference", "eet-2.0");

const RSA_SHA256: RsaHashedImportParams = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

export function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

/** `test.each`-equivalent for `node:test` (not provided by the module), used by both runtimes. */
export function each<T extends readonly unknown[]>(cases: readonly T[]) {
  return (name: string, fn: (...args: T) => void | Promise<void>): void => {
    for (const args of cases) {
      let i = 0;
      const title = name.replace(/%[sdifjo%]/g, (token) =>
        token === "%%" ? "%" : String(args[i++]),
      );
      test(title, () => fn(...args));
    }
  };
}

/** Validates and brands raw receipt data, throwing if it's invalid (test fixtures only). */
export function brandedReceipt(input: EetReceiptDataInput): EetReceiptData {
  return getOrThrow(parseEetReceiptData(input));
}

/** Validates and brands a raw `<Hlavicka>`, throwing if it's invalid (test fixtures only). */
export function brandedHeader(input: EetHeaderInput): EetHeader {
  return getOrThrow(parseHeader(input));
}

// --- Genuine EET 2.0 playground reference messages (docs/reference/eet-2.0/*.eet.v4.req.xml): ---
// --- real, signed `OdeslaniTrzby` SOAP requests, each with a matching real cash-register ---
// --- certificate/key in `caeet/CA_EET-Playground-<eic>.p12`. Shared by the default ---
// --- (unsigned-shape) round-trip test and the opt-in `.p12`-backed real-key test. ---

/** Taxpayer EICs with both a captured reference request message and a matching `caeet/*.p12`. */
export const REFERENCE_SAMPLE_EICS = ["CZ00000019", "CZ683555118", "CZ8551015704"] as const;

export interface ReferenceTrzbaMessage {
  readonly hlavicka: XmlElement;
  readonly data: XmlElement;
  /** DER bytes of the `<wsse:BinarySecurityToken>` embedded in the captured message. */
  readonly binarySecurityTokenDer: Uint8Array;
}

function requireReferenceChild(
  parent: XmlElement,
  uri: string,
  local: string,
  context: string,
): XmlElement {
  const child = findChild(parent, uri, local);
  if (child === undefined) throw new Error(`${context}: missing <${local}>`);
  return child;
}

function requireReferenceAttribute(element: XmlElement, local: string, context: string): string {
  const value = getAttribute(element, "", local);
  if (value === undefined) throw new Error(`${context}: missing required attribute "${local}"`);
  return value;
}

/** Reads and parses `docs/reference/eet-2.0/<eic>.eet.v4.req.xml`. */
export function readReferenceTrzbaMessage(eic: string): ReferenceTrzbaMessage {
  const fileName = `${eic}.eet.v4.req.xml`;
  const xml = readFileSync(join(REFERENCE_SAMPLES_DIR, fileName), "utf8");
  const root = getOrThrow(parseXmlDocument(xml));
  const soapHeader = requireReferenceChild(root, SOAP_NAMESPACE, "Header", fileName);
  const security = requireReferenceChild(soapHeader, WSSE_NAMESPACE, "Security", fileName);
  const bst = requireReferenceChild(security, WSSE_NAMESPACE, "BinarySecurityToken", fileName);
  const body = requireReferenceChild(root, SOAP_NAMESPACE, "Body", fileName);
  const trzba = requireReferenceChild(body, EET_NAMESPACE, "Trzba", fileName);
  const hlavicka = requireReferenceChild(trzba, EET_NAMESPACE, "Hlavicka", fileName);
  const data = requireReferenceChild(trzba, EET_NAMESPACE, "Data", fileName);
  return { hlavicka, data, binarySecurityTokenDer: decodeBase64(textContent(bst).trim()) };
}

/** Rebuilds an {@link EetReceiptDataInput} from a reference message's `<Data>` element. */
export function referenceReceiptDataInput(data: XmlElement, eic: string): EetReceiptDataInput {
  const context = `${eic}.eet.v4.req.xml`;
  const eicPoverujiciho = getAttribute(data, "", "eic_poverujiciho");
  const povereniVicePopl = getAttribute(data, "", "povereni_vice_popl");
  const urcenoCerpZuct = getAttribute(data, "", "urceno_cerp_zuct");
  const cerpZuct = getAttribute(data, "", "cerp_zuct");

  return {
    eic_popl: requireReferenceAttribute(data, "eic_popl", context),
    ...(eicPoverujiciho !== undefined ? { eic_poverujiciho: eicPoverujiciho } : {}),
    ...(povereniVicePopl !== undefined ? { povereni_vice_popl: povereniVicePopl === "true" } : {}),
    id_jednotky: requireReferenceAttribute(data, "id_jednotky", context),
    id_pokl: requireReferenceAttribute(data, "id_pokl", context),
    porad_cis: requireReferenceAttribute(data, "porad_cis", context),
    dat_trzby: requireReferenceAttribute(data, "dat_trzby", context),
    celk_trzba: requireReferenceAttribute(data, "celk_trzba", context),
    ...(urcenoCerpZuct !== undefined ? { urceno_cerp_zuct: urcenoCerpZuct } : {}),
    ...(cerpZuct !== undefined ? { cerp_zuct: cerpZuct } : {}),
  };
}

/** Rebuilds an {@link EetHeaderInput} from a reference message's `<Hlavicka>` element. */
export function referenceHeaderInput(hlavicka: XmlElement, eic: string): EetHeaderInput {
  const context = `${eic}.eet.v4.req.xml`;
  const firstSubmission = requireReferenceAttribute(hlavicka, "prvni_zaslani", context);
  const verification = getAttribute(hlavicka, "", "overeni");
  return {
    uuid: requireReferenceAttribute(hlavicka, "uuid_zpravy", context),
    sentAt: requireReferenceAttribute(hlavicka, "dat_odesl", context),
    firstSubmission: firstSubmission === "true",
    verification: verification === "true",
  };
}

/**
 * Builds an {@link EetSigner} purely from Web Crypto (`globalThis.crypto.subtle`), backed by a
 * throwaway self-signed test certificate/key pair generated for this SDK's test suite only
 * (`test/fixtures`, not affiliated with the real EET playground or production CA).
 */
export async function createTestSigner(certFile: string, keyFile: string): Promise<EetSigner> {
  const certificateDer = readFixture(certFile);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    readFixture(keyFile) as BufferSource,
    RSA_SHA256,
    false,
    ["sign"],
  );
  return createCryptoKeySigner(certificateDer, privateKey);
}

// --- Test-only "server" fixtures: build a raw <Odpoved> SOAP response, mirroring what the ---
// --- EET system would send back, so response parsing/verification can be exercised without ---
// --- a live playground round trip.

function noNsAttribute(local: string, value: string): XmlAttribute {
  return { name: { prefix: "", local, uri: "" }, value };
}

export interface FixtureWarning {
  code: number;
  message?: string;
}

function buildWarningElements(warnings: readonly FixtureWarning[] = []): XmlElement[] {
  return warnings.map((warning) =>
    xmlElement(
      { prefix: "tns", local: "Varovani", uri: EET_NAMESPACE },
      {
        attributes: [noNsAttribute("kod_varov", String(warning.code))],
        children: warning.message !== undefined ? [xmlText(warning.message)] : [],
      },
    ),
  );
}

export function buildPotvrzeniOdpoved(input: {
  uuid: string;
  receivedAt: string;
  pok: string;
  test?: boolean;
  warnings?: readonly FixtureWarning[];
}): XmlElement {
  const header = xmlElement(
    { prefix: "tns", local: "Hlavicka", uri: EET_NAMESPACE },
    {
      attributes: [
        noNsAttribute("uuid_zpravy", input.uuid),
        noNsAttribute("dat_prij", input.receivedAt),
      ],
    },
  );
  const potvrzeniAttributes = [noNsAttribute("pok", input.pok)];
  if (input.test !== undefined)
    potvrzeniAttributes.push(noNsAttribute("test", input.test ? "true" : "false"));
  const potvrzeni = xmlElement(
    { prefix: "tns", local: "Potvrzeni", uri: EET_NAMESPACE },
    { attributes: potvrzeniAttributes },
  );

  return xmlElement(
    { prefix: "tns", local: "Odpoved", uri: EET_NAMESPACE },
    { children: [header, potvrzeni, ...buildWarningElements(input.warnings)] },
  );
}

export function buildChybaOdpoved(input: {
  uuid?: string;
  rejectedAt?: string;
  code: number;
  message: string;
  test?: boolean;
  warnings?: readonly FixtureWarning[];
}): XmlElement {
  const headerAttributes: XmlAttribute[] = [];
  if (input.uuid !== undefined) headerAttributes.push(noNsAttribute("uuid_zpravy", input.uuid));
  if (input.rejectedAt !== undefined)
    headerAttributes.push(noNsAttribute("dat_odmit", input.rejectedAt));
  const header = xmlElement(
    { prefix: "tns", local: "Hlavicka", uri: EET_NAMESPACE },
    { attributes: headerAttributes },
  );

  const chybaAttributes = [noNsAttribute("kod", String(input.code))];
  if (input.test !== undefined)
    chybaAttributes.push(noNsAttribute("test", input.test ? "true" : "false"));
  const chyba = xmlElement(
    { prefix: "tns", local: "Chyba", uri: EET_NAMESPACE },
    { attributes: chybaAttributes, children: [xmlText(input.message)] },
  );

  return xmlElement(
    { prefix: "tns", local: "Odpoved", uri: EET_NAMESPACE },
    { children: [header, chyba, ...buildWarningElements(input.warnings)] },
  );
}

/** Wraps an unsigned `<Odpoved>` (used for `<Chyba>` responses, which are never signed). */
export function buildUnsignedOdpovedResponse(odpoved: XmlElement): string {
  const body = xmlElement(
    { prefix: "soap", local: "Body", uri: SOAP_NAMESPACE },
    { children: [odpoved] },
  );
  const envelope = xmlElement(
    { prefix: "soap", local: "Envelope", uri: SOAP_NAMESPACE },
    { children: [body] },
  );
  return `<?xml version="1.0" encoding="UTF-8"?>${canonicalizeToString(envelope)}`;
}

/** Signs an `<Odpoved>` (used for `<Potvrzeni>` responses), mirroring the SDK's own request signing. */
export async function buildSignedOdpovedResponse(
  odpoved: XmlElement,
  signer: EetSigner,
): Promise<string> {
  const bodyId = "Body";
  const bstId = "X509Token";
  const body = xmlElement(
    { prefix: "soap", local: "Body", uri: SOAP_NAMESPACE },
    {
      attributes: [{ name: { prefix: "wsu", local: "Id", uri: WSU_NAMESPACE }, value: bodyId }],
      children: [odpoved],
    },
  );
  const bodyCanonicalString = canonicalizeToString(body);
  const digest = await sha256(new TextEncoder().encode(bodyCanonicalString));
  const digestBase64 = encodeBase64(digest);

  const algorithmAttr = (algorithm: string): XmlAttribute[] => [
    { name: { prefix: "", local: "Algorithm", uri: "" }, value: algorithm },
  ];
  const signedInfo = xmlElement(
    { prefix: "ds", local: "SignedInfo", uri: DS_NAMESPACE },
    {
      children: [
        xmlElement(
          { prefix: "ds", local: "CanonicalizationMethod", uri: DS_NAMESPACE },
          { attributes: algorithmAttr(EXCLUSIVE_C14N_ALGORITHM) },
        ),
        xmlElement(
          { prefix: "ds", local: "SignatureMethod", uri: DS_NAMESPACE },
          { attributes: algorithmAttr(RSA_SHA256_SIGNATURE_ALGORITHM) },
        ),
        xmlElement(
          { prefix: "ds", local: "Reference", uri: DS_NAMESPACE },
          {
            attributes: [{ name: { prefix: "", local: "URI", uri: "" }, value: `#${bodyId}` }],
            children: [
              xmlElement(
                { prefix: "ds", local: "Transforms", uri: DS_NAMESPACE },
                {
                  children: [
                    xmlElement(
                      { prefix: "ds", local: "Transform", uri: DS_NAMESPACE },
                      { attributes: algorithmAttr(EXCLUSIVE_C14N_ALGORITHM) },
                    ),
                  ],
                },
              ),
              xmlElement(
                { prefix: "ds", local: "DigestMethod", uri: DS_NAMESPACE },
                { attributes: algorithmAttr(SHA256_DIGEST_ALGORITHM) },
              ),
              xmlElement(
                { prefix: "ds", local: "DigestValue", uri: DS_NAMESPACE },
                { children: [xmlText(digestBase64)] },
              ),
            ],
          },
        ),
      ],
    },
  );
  const signedInfoCanonicalString = canonicalizeToString(signedInfo);
  const signatureBytes = await signer.sign(new TextEncoder().encode(signedInfoCanonicalString));
  const signatureBase64 = encodeBase64(new Uint8Array(signatureBytes));
  const certificateBase64 = encodeBase64(new Uint8Array(await signer.getCertificate()));

  const envelope =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soap:Envelope xmlns:soap="${SOAP_NAMESPACE}">` +
    "<soap:Header>" +
    `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">` +
    `<wsse:BinarySecurityToken xmlns:wsu="${WSU_NAMESPACE}" wsu:Id="${bstId}" ` +
    `EncodingType="${BINARY_SECURITY_TOKEN_ENCODING_TYPE}" ValueType="${BINARY_SECURITY_TOKEN_VALUE_TYPE}">` +
    `${certificateBase64}</wsse:BinarySecurityToken>` +
    `<ds:Signature xmlns:ds="${DS_NAMESPACE}">` +
    signedInfoCanonicalString +
    `<ds:SignatureValue>${signatureBase64}</ds:SignatureValue>` +
    "<ds:KeyInfo><wsse:SecurityTokenReference>" +
    `<wsse:Reference URI="#${bstId}" ValueType="${BINARY_SECURITY_TOKEN_VALUE_TYPE}"/>` +
    "</wsse:SecurityTokenReference></ds:KeyInfo>" +
    "</ds:Signature>" +
    "</wsse:Security>" +
    "</soap:Header>" +
    bodyCanonicalString +
    "</soap:Envelope>";

  return envelope;
}

export function buildSoapFaultResponse(faultCode: string, faultString: string): string {
  const fault = xmlElement(
    { prefix: "soap", local: "Fault", uri: SOAP_NAMESPACE },
    {
      children: [
        xmlElement({ prefix: "", local: "faultcode", uri: "" }, { children: [xmlText(faultCode)] }),
        xmlElement(
          { prefix: "", local: "faultstring", uri: "" },
          { children: [xmlText(faultString)] },
        ),
      ],
    },
  );
  const body = xmlElement(
    { prefix: "soap", local: "Body", uri: SOAP_NAMESPACE },
    { children: [fault] },
  );
  const envelope = xmlElement(
    { prefix: "soap", local: "Envelope", uri: SOAP_NAMESPACE },
    { children: [body] },
  );
  return `<?xml version="1.0" encoding="UTF-8"?>${canonicalizeToString(envelope)}`;
}
