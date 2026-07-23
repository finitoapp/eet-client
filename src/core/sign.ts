import type { EetHeader } from "../types/header.ts";
import type { EetReceiptData } from "../types/receipt.ts";
import type { EetSigner } from "../types/signer.ts";
import { encodeBase64 } from "./base64.ts";
import { buildTrzbaElement } from "./build-request.ts";
import {
  BINARY_SECURITY_TOKEN_ENCODING_TYPE,
  BINARY_SECURITY_TOKEN_VALUE_TYPE,
  DS_NAMESPACE,
  EXCLUSIVE_C14N_ALGORITHM,
  RSA_SHA256_SIGNATURE_ALGORITHM,
  SHA256_DIGEST_ALGORITHM,
  SOAP_NAMESPACE,
  WSU_NAMESPACE,
} from "./namespaces.ts";
import { sha256 } from "./webcrypto.ts";
import { canonicalizeToString } from "./xml/c14n.ts";
import { type XmlAttribute, type XmlElement, xmlElement, xmlText } from "./xml/model.ts";

const BODY_ID = "Body";
const BINARY_SECURITY_TOKEN_ID = "X509Token";

function algorithmAttribute(algorithm: string): XmlAttribute[] {
  return [{ name: { prefix: "", local: "Algorithm", uri: "" }, value: algorithm }];
}

function buildSignedInfo(digestBase64: string): XmlElement {
  const transform = xmlElement(
    { prefix: "ds", local: "Transform", uri: DS_NAMESPACE },
    { attributes: algorithmAttribute(EXCLUSIVE_C14N_ALGORITHM) },
  );
  const transforms = xmlElement(
    { prefix: "ds", local: "Transforms", uri: DS_NAMESPACE },
    { children: [transform] },
  );
  const digestMethod = xmlElement(
    { prefix: "ds", local: "DigestMethod", uri: DS_NAMESPACE },
    { attributes: algorithmAttribute(SHA256_DIGEST_ALGORITHM) },
  );
  const digestValue = xmlElement(
    { prefix: "ds", local: "DigestValue", uri: DS_NAMESPACE },
    { children: [xmlText(digestBase64)] },
  );
  const reference = xmlElement(
    { prefix: "ds", local: "Reference", uri: DS_NAMESPACE },
    {
      attributes: [{ name: { prefix: "", local: "URI", uri: "" }, value: `#${BODY_ID}` }],
      children: [transforms, digestMethod, digestValue],
    },
  );
  const canonicalizationMethod = xmlElement(
    { prefix: "ds", local: "CanonicalizationMethod", uri: DS_NAMESPACE },
    { attributes: algorithmAttribute(EXCLUSIVE_C14N_ALGORITHM) },
  );
  const signatureMethod = xmlElement(
    { prefix: "ds", local: "SignatureMethod", uri: DS_NAMESPACE },
    { attributes: algorithmAttribute(RSA_SHA256_SIGNATURE_ALGORITHM) },
  );

  return xmlElement(
    { prefix: "ds", local: "SignedInfo", uri: DS_NAMESPACE },
    { children: [canonicalizationMethod, signatureMethod, reference] },
  );
}

/**
 * Builds the fully signed SOAP 1.1 request for one receipt: computes the SHA-256 digest of the
 * canonical `<soap:Body>`, builds and canonicalizes `<ds:SignedInfo>`, asks `signer` to produce
 * the RSA-SHA256 signature over it, and assembles the WS-Security header (`BinarySecurityToken`
 * + `Signature` + `KeyInfo`/`SecurityTokenReference`) around it. No other header
 * (Timestamp, WS-Addressing, ...) is added, per the EET specification.
 */
export async function buildSignedRequest(
  data: EetReceiptData,
  header: EetHeader,
  signer: EetSigner,
): Promise<string> {
  const trzba = buildTrzbaElement(data, header);
  const body = xmlElement(
    { prefix: "soap", local: "Body", uri: SOAP_NAMESPACE },
    {
      attributes: [{ name: { prefix: "wsu", local: "Id", uri: WSU_NAMESPACE }, value: BODY_ID }],
      children: [trzba],
    },
  );

  const bodyCanonicalString = canonicalizeToString(body);
  const bodyDigest = await sha256(new TextEncoder().encode(bodyCanonicalString));
  const digestBase64 = encodeBase64(bodyDigest);

  const signedInfo = buildSignedInfo(digestBase64);
  const signedInfoCanonicalString = canonicalizeToString(signedInfo);
  const signedInfoCanonicalBytes = new TextEncoder().encode(signedInfoCanonicalString);

  const signatureBytes = await signer.sign(signedInfoCanonicalBytes);
  const signatureBase64 = encodeBase64(new Uint8Array(signatureBytes));

  const certificateDer = await signer.getCertificate();
  const certificateBase64 = encodeBase64(new Uint8Array(certificateDer));

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soap:Envelope xmlns:soap="${SOAP_NAMESPACE}">` +
    "<soap:Header>" +
    `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">` +
    `<wsse:BinarySecurityToken xmlns:wsu="${WSU_NAMESPACE}" wsu:Id="${BINARY_SECURITY_TOKEN_ID}" ` +
    `EncodingType="${BINARY_SECURITY_TOKEN_ENCODING_TYPE}" ValueType="${BINARY_SECURITY_TOKEN_VALUE_TYPE}">` +
    `${certificateBase64}</wsse:BinarySecurityToken>` +
    `<ds:Signature xmlns:ds="${DS_NAMESPACE}">` +
    signedInfoCanonicalString +
    `<ds:SignatureValue>${signatureBase64}</ds:SignatureValue>` +
    "<ds:KeyInfo><wsse:SecurityTokenReference>" +
    `<wsse:Reference URI="#${BINARY_SECURITY_TOKEN_ID}" ValueType="${BINARY_SECURITY_TOKEN_VALUE_TYPE}"/>` +
    "</wsse:SecurityTokenReference></ds:KeyInfo>" +
    "</ds:Signature>" +
    "</wsse:Security>" +
    "</soap:Header>" +
    bodyCanonicalString +
    "</soap:Envelope>"
  );
}

// Exported for tests/tooling that need to assert against the exact fixed identifiers used above.
export const SIGNED_BODY_ID = BODY_ID;
export const SIGNED_BINARY_SECURITY_TOKEN_ID = BINARY_SECURITY_TOKEN_ID;
