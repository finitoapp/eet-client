import { err, ok, type Result, tryAsync } from "../result.ts";
import {
  createEetHttpError,
  createEetResponseSchemaError,
  createEetSignatureError,
  createEetSoapFaultError,
  createEetXmlError,
  type EetError,
  type EetHttpError,
  type EetResponseSchemaError,
  isEetError,
} from "../types/errors.ts";
import type { EetSubmitOutcome, EetWarning } from "../types/result.ts";
import type { ResponseSignatureVerifier } from "../types/verifier.ts";
import { decodeBase64 } from "./base64.ts";
import { bytesEqual } from "./bytes.ts";
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
import {
  KOD_CHYBA_PATTERN,
  KOD_VAROV_PATTERN,
  MAX_MESSAGE_TEXT_LENGTH,
  MAX_WARNINGS,
  POK_PATTERN,
} from "./patterns.ts";
import { sha256 } from "./webcrypto.ts";
import { canonicalizeToBytes } from "./xml/c14n.ts";
import {
  findChild,
  findChildren,
  getAttribute,
  parseXmlDocument,
  textContent,
  type XmlElement,
} from "./xml/index.ts";

export interface ParseResponseContext {
  readonly httpStatus: number;
  readonly globalTransactionId?: string;
  readonly responseSignatureVerifier: ResponseSignatureVerifier;
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** Checks `message` (already trimmed `<Chyba>`/`<Varovani>` text) against the XSD length limit. */
function checkMessageLength(local: string, message: string): string | undefined {
  if (message.length > MAX_MESSAGE_TEXT_LENGTH) {
    return `<${local}> text content is ${message.length} characters, the XSD allows a maximum of ${MAX_MESSAGE_TEXT_LENGTH}.`;
  }
  return undefined;
}

function parseWarnings(odpoved: XmlElement): Result<readonly EetWarning[], EetResponseSchemaError> {
  const elements = findChildren(odpoved, EET_NAMESPACE, "Varovani");
  if (elements.length > MAX_WARNINGS) {
    return err(
      createEetResponseSchemaError({
        message: `Response contains ${elements.length} <Varovani> elements, the XSD allows a maximum of ${MAX_WARNINGS}.`,
      }),
    );
  }
  const warnings: EetWarning[] = [];
  for (const element of elements) {
    const codeRaw = getAttribute(element, "", "kod_varov");
    if (codeRaw === undefined || !KOD_VAROV_PATTERN.test(codeRaw)) {
      return err(
        createEetResponseSchemaError({
          message: `<Varovani> has an invalid or missing kod_varov attribute.`,
        }),
      );
    }
    const message = textContent(element).trim();
    const lengthIssue = checkMessageLength("Varovani", message);
    if (lengthIssue !== undefined) {
      return err(createEetResponseSchemaError({ message: lengthIssue }));
    }
    warnings.push(
      message.length > 0 ? { code: Number(codeRaw), message } : { code: Number(codeRaw) },
    );
  }
  return ok(warnings);
}

function extractSoapBody(
  root: XmlElement,
  httpStatus: number,
  globalTransactionId?: string,
): Result<XmlElement, EetHttpError | EetResponseSchemaError> {
  const schemaError = (message: string): Result<never, EetHttpError | EetResponseSchemaError> => {
    if (!isSuccessStatus(httpStatus)) {
      return err(createEetHttpError({ message, httpStatus, globalTransactionId }));
    }
    return err(createEetResponseSchemaError({ message, httpStatus, globalTransactionId }));
  };

  if (root.name.uri !== SOAP_NAMESPACE || root.name.local !== "Envelope") {
    return schemaError("Response root element is not soap:Envelope.");
  }
  const body = findChild(root, SOAP_NAMESPACE, "Body");
  if (body === undefined) return schemaError("Response does not contain soap:Body.");
  return ok(body);
}

function extractSoapFault(
  body: XmlElement,
): { faultCode?: string; faultString?: string } | undefined {
  const fault = findChild(body, SOAP_NAMESPACE, "Fault");
  if (fault === undefined) return undefined;
  const faultCode = findChild(fault, "", "faultcode");
  const faultString = findChild(fault, "", "faultstring");
  return {
    ...(faultCode !== undefined ? { faultCode: textContent(faultCode).trim() } : {}),
    ...(faultString !== undefined ? { faultString: textContent(faultString).trim() } : {}),
  };
}

async function verifyAcceptedSignature(
  root: XmlElement,
  body: XmlElement,
  context: ParseResponseContext,
  rawXml: string,
): Promise<void> {
  const { httpStatus, globalTransactionId, responseSignatureVerifier } = context;
  const fail = (message: string): never => {
    throw createEetSignatureError({ message, httpStatus, globalTransactionId });
  };
  const requireChild = (
    parent: XmlElement,
    uri: string,
    local: string,
    message: string,
  ): XmlElement => findChild(parent, uri, local) ?? fail(message);
  const requireAlgorithm = (element: XmlElement, expected: string, message: string): void => {
    if (getAttribute(element, "", "Algorithm") !== expected) throw fail(message);
  };

  const header = requireChild(
    root,
    SOAP_NAMESPACE,
    "Header",
    "Confirmation response does not contain soap:Header.",
  );
  const security = requireChild(
    header,
    WSSE_NAMESPACE,
    "Security",
    "Confirmation response does not contain wsse:Security.",
  );
  const signature = requireChild(
    security,
    DS_NAMESPACE,
    "Signature",
    "Confirmation response does not contain ds:Signature.",
  );
  const signedInfo = requireChild(
    signature,
    DS_NAMESPACE,
    "SignedInfo",
    "ds:Signature is missing SignedInfo.",
  );
  const signatureValueEl = requireChild(
    signature,
    DS_NAMESPACE,
    "SignatureValue",
    "ds:Signature is missing SignatureValue.",
  );

  const canonicalizationMethod = requireChild(
    signedInfo,
    DS_NAMESPACE,
    "CanonicalizationMethod",
    "ds:SignedInfo is missing CanonicalizationMethod.",
  );
  const signatureMethod = requireChild(
    signedInfo,
    DS_NAMESPACE,
    "SignatureMethod",
    "ds:SignedInfo is missing SignatureMethod.",
  );
  const references = findChildren(signedInfo, DS_NAMESPACE, "Reference");

  requireAlgorithm(
    canonicalizationMethod,
    EXCLUSIVE_C14N_ALGORITHM,
    "Unexpected CanonicalizationMethod (Exclusive C14N 1.0 required).",
  );
  requireAlgorithm(
    signatureMethod,
    RSA_SHA256_SIGNATURE_ALGORITHM,
    "Unexpected SignatureMethod (RSA-SHA256 required).",
  );
  if (references.length !== 1) throw fail("ds:SignedInfo must contain exactly one ds:Reference.");
  const reference = references[0] ?? fail("ds:SignedInfo must contain exactly one ds:Reference.");

  const bodyId = getAttribute(body, WSU_NAMESPACE, "Id");
  const referenceUri = getAttribute(reference, "", "URI");
  if (bodyId === undefined || referenceUri !== `#${bodyId}`) {
    throw fail("ds:Reference does not point to the signed soap:Body.");
  }

  const transforms = requireChild(
    reference,
    DS_NAMESPACE,
    "Transforms",
    "ds:Reference is missing Transforms.",
  );
  const transform = requireChild(
    transforms,
    DS_NAMESPACE,
    "Transform",
    "ds:Transforms is missing Transform.",
  );
  requireAlgorithm(
    transform,
    EXCLUSIVE_C14N_ALGORITHM,
    "Unexpected reference transform (Exclusive C14N 1.0 required).",
  );

  const digestMethod = requireChild(
    reference,
    DS_NAMESPACE,
    "DigestMethod",
    "ds:Reference is missing DigestMethod.",
  );
  requireAlgorithm(
    digestMethod,
    SHA256_DIGEST_ALGORITHM,
    "Unexpected DigestMethod (SHA-256 required).",
  );
  const digestValueEl = requireChild(
    reference,
    DS_NAMESPACE,
    "DigestValue",
    "ds:Reference is missing DigestValue.",
  );

  let digestValue: Uint8Array;
  let signatureValue: Uint8Array;
  try {
    digestValue = decodeBase64(textContent(digestValueEl).trim());
    signatureValue = decodeBase64(textContent(signatureValueEl).trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw fail(`Invalid base64 value in signature: ${message}`);
  }

  // Don't trust every wsse:BinarySecurityToken under wsse:Security indiscriminately (there could
  // be more than one, e.g. an extra/decoy token) — resolve ds:KeyInfo/wsse:SecurityTokenReference
  // to the one the signature actually claims to be signed with, by wsu:Id.
  const keyInfo = requireChild(
    signature,
    DS_NAMESPACE,
    "KeyInfo",
    "ds:Signature is missing KeyInfo.",
  );
  const securityTokenReference = requireChild(
    keyInfo,
    WSSE_NAMESPACE,
    "SecurityTokenReference",
    "ds:KeyInfo is missing wsse:SecurityTokenReference.",
  );
  const tokenReference = requireChild(
    securityTokenReference,
    WSSE_NAMESPACE,
    "Reference",
    "wsse:SecurityTokenReference is missing wsse:Reference.",
  );
  const tokenReferenceUri = getAttribute(tokenReference, "", "URI");
  const referencedTokenId = tokenReferenceUri?.startsWith("#")
    ? tokenReferenceUri.slice(1)
    : undefined;
  if (referencedTokenId === undefined) {
    throw fail("wsse:Reference URI does not reference a local wsse:BinarySecurityToken.");
  }
  const referencedToken = findChildren(security, WSSE_NAMESPACE, "BinarySecurityToken").find(
    (el) => getAttribute(el, WSU_NAMESPACE, "Id") === referencedTokenId,
  );
  if (referencedToken === undefined) {
    throw fail(
      "ds:KeyInfo references a wsse:BinarySecurityToken that is not present in wsse:Security.",
    );
  }

  let certificates: Uint8Array[];
  try {
    certificates = [decodeBase64(textContent(referencedToken).trim())];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw fail(`Invalid base64 certificate: ${message}`);
  }

  const bodyCanonical = canonicalizeToBytes(body);
  const signedInfoCanonical = canonicalizeToBytes(signedInfo);

  const computedDigest = await sha256(bodyCanonical);
  if (!bytesEqual(computedDigest, digestValue)) {
    throw fail("soap:Body digest does not match the value in ds:DigestValue.");
  }

  let verified: boolean;
  try {
    verified = await responseSignatureVerifier.verify({
      raw: rawXml,
      signature: {
        signedBodyCanonical: bodyCanonical,
        signedInfoCanonical,
        signatureValue,
        digestValue,
        certificates,
        canonicalizationAlgorithm: EXCLUSIVE_C14N_ALGORITHM,
        digestAlgorithm: SHA256_DIGEST_ALGORITHM,
        signatureAlgorithm: RSA_SHA256_SIGNATURE_ALGORITHM,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw fail(`responseSignatureVerifier failed with an error: ${message}`);
  }
  if (!verified) throw fail("Failed to verify the response signature.");
}

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/**
 * Parses a raw SOAP response body and turns it into a {@link EetSubmitOutcome}, or returns an
 * `Err` with a typed error (SOAP Fault, malformed XML, schema mismatch, or signature failure).
 * A `Potvrzeni` response is never returned as `accepted` unless
 * `context.responseSignatureVerifier` resolves the signature as valid.
 */
export async function parseAndVerifyResponse(
  rawXml: string,
  context: ParseResponseContext,
): Promise<Result<EetSubmitOutcome, EetError>> {
  const { httpStatus, globalTransactionId } = context;

  const parsedXml = parseXmlDocument(rawXml);
  if (!parsedXml.ok) {
    const message = parsedXml.error.message;
    if (!isSuccessStatus(httpStatus)) {
      return err(
        createEetHttpError({
          message: `HTTP ${httpStatus}: ${message}`,
          httpStatus,
          globalTransactionId,
        }),
      );
    }
    return err(createEetXmlError({ message, httpStatus, globalTransactionId }));
  }
  const root = parsedXml.value;

  const bodyResult = extractSoapBody(root, httpStatus, globalTransactionId);
  if (!bodyResult.ok) return bodyResult;
  const body = bodyResult.value;

  const fault = extractSoapFault(body);
  if (fault !== undefined) {
    return err(
      createEetSoapFaultError({
        message: fault.faultString ?? "SOAP Fault",
        ...fault,
        httpStatus,
        globalTransactionId,
      }),
    );
  }

  const odpoved = findChild(body, EET_NAMESPACE, "Odpoved");
  if (odpoved === undefined) {
    if (!isSuccessStatus(httpStatus)) {
      return err(
        createEetHttpError({
          message: `Unexpected HTTP ${httpStatus} response with no recognizable content.`,
          httpStatus,
          globalTransactionId,
        }),
      );
    }
    return err(
      createEetResponseSchemaError({
        message: "soap:Body does not contain tns:Odpoved.",
        httpStatus,
        globalTransactionId,
      }),
    );
  }

  const header = findChild(odpoved, EET_NAMESPACE, "Hlavicka");
  if (header === undefined) {
    return err(
      createEetResponseSchemaError({
        message: "tns:Odpoved does not contain tns:Hlavicka.",
        httpStatus,
        globalTransactionId,
      }),
    );
  }
  const uuid = getAttribute(header, "", "uuid_zpravy");
  const receivedAt = getAttribute(header, "", "dat_prij");
  const rejectedAt = getAttribute(header, "", "dat_odmit");

  const potvrzeni = findChild(odpoved, EET_NAMESPACE, "Potvrzeni");
  const chyba = findChild(odpoved, EET_NAMESPACE, "Chyba");
  if (potvrzeni === undefined && chyba === undefined) {
    return err(
      createEetResponseSchemaError({
        message: "tns:Odpoved contains neither Potvrzeni nor Chyba.",
        httpStatus,
        globalTransactionId,
      }),
    );
  }
  if (potvrzeni !== undefined && chyba !== undefined) {
    return err(
      createEetResponseSchemaError({
        message: "tns:Odpoved contains both Potvrzeni and Chyba.",
        httpStatus,
        globalTransactionId,
      }),
    );
  }

  const warningsResult = parseWarnings(odpoved);
  if (!warningsResult.ok) return warningsResult;
  const warnings = warningsResult.value;

  if (chyba !== undefined) {
    const codeRaw = getAttribute(chyba, "", "kod");
    if (codeRaw === undefined || !KOD_CHYBA_PATTERN.test(codeRaw)) {
      return err(
        createEetResponseSchemaError({
          message: "tns:Chyba has an invalid or missing kod attribute.",
          httpStatus,
          globalTransactionId,
        }),
      );
    }
    const code = Number(codeRaw);
    const message = textContent(chyba).trim();
    const lengthIssue = checkMessageLength("Chyba", message);
    if (lengthIssue !== undefined) {
      return err(
        createEetResponseSchemaError({ message: lengthIssue, httpStatus, globalTransactionId }),
      );
    }
    const test = parseBoolean(getAttribute(chyba, "", "test"));

    if (code === 0) {
      return ok({
        status: "verification",
        test,
        warnings,
        httpStatus,
        ...(uuid !== undefined ? { uuid } : {}),
        ...(globalTransactionId !== undefined ? { globalTransactionId } : {}),
      });
    }
    return ok({
      status: "rejected",
      code,
      message,
      test,
      warnings,
      httpStatus,
      ...(uuid !== undefined ? { uuid } : {}),
      ...(rejectedAt !== undefined ? { rejectedAt } : {}),
      ...(globalTransactionId !== undefined ? { globalTransactionId } : {}),
    });
  }

  if (potvrzeni === undefined) {
    // Unreachable: the checks above guarantee exactly one of potvrzeni/chyba is defined and
    // chyba returned above, but the type checker can't derive that across separate branches.
    return err(
      createEetResponseSchemaError({
        message: "tns:Odpoved contains neither Potvrzeni nor Chyba.",
        httpStatus,
        globalTransactionId,
      }),
    );
  }
  const potvrzeniEl = potvrzeni;
  const pok = getAttribute(potvrzeniEl, "", "pok");
  if (pok === undefined || !POK_PATTERN.test(pok)) {
    return err(
      createEetResponseSchemaError({
        message: "tns:Potvrzeni has an invalid or missing pok attribute.",
        httpStatus,
        globalTransactionId,
      }),
    );
  }
  if (uuid === undefined || receivedAt === undefined) {
    return err(
      createEetResponseSchemaError({
        message: "Confirmation response must contain uuid_zpravy and dat_prij in tns:Hlavicka.",
        httpStatus,
        globalTransactionId,
      }),
    );
  }
  const test = parseBoolean(getAttribute(potvrzeniEl, "", "test"));

  const signatureResult = await tryAsync(
    () => verifyAcceptedSignature(root, body, context, rawXml),
    (error) =>
      isEetError(error, "EetSignatureError")
        ? error
        : createEetSignatureError({ message: String(error) }),
  );
  if (!signatureResult.ok) return signatureResult;

  return ok({
    status: "accepted",
    pok,
    uuid,
    receivedAt,
    test,
    warnings,
    httpStatus,
    ...(globalTransactionId !== undefined ? { globalTransactionId } : {}),
  });
}
