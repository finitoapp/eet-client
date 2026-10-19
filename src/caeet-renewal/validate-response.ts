import { decodeBase64, encodeBase64 } from "../core/base64.ts";
import { isValidEetDateTime } from "../core/patterns.ts";
import type {
  CaeetCertificate,
  CaeetPkcs12Claim,
  CaeetRenewalRequest,
  CaeetRequestStatus,
  CaeetUnfinishedRequests,
} from "./types.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function isRenewalRequest(value: unknown): value is Pick<CaeetRenewalRequest, "reqId"> {
  return isObject(value) && isRequestId(value["reqId"]);
}

export function isRenewalStatus(value: unknown): value is CaeetRequestStatus {
  if (!isObject(value) || !isRequestId(value["reqId"])) return false;
  const pollAfterSeconds = value["pollAfterSeconds"];
  if (pollAfterSeconds !== undefined && !isPositiveInteger(pollAfterSeconds)) return false;
  switch (value["state"]) {
    case "INPROCESS":
      return isPositiveInteger(pollAfterSeconds);
    case "REJECTED":
      return typeof value["rejectedReason"] === "string";
    case "ISSUED":
    case "DELIVERING":
    case "FINISHED":
      return true;
    default:
      return false;
  }
}

function isDateTime(value: unknown): value is string {
  // CA EET examples use a space separator; keep the returned text and fractional seconds intact.
  return (
    typeof value === "string" &&
    isValidEetDateTime(
      value
        .replace(/[t ]/, "T")
        .replace(/\.\d+(?=Z|[+-])/i, "")
        .replace(/z$/, "Z"),
    )
  );
}

function isCertificate(value: unknown): value is CaeetCertificate {
  return (
    isObject(value) &&
    typeof value["sn"] === "string" &&
    /^\d+$/.test(value["sn"]) &&
    isDateTime(value["validFrom"]) &&
    isDateTime(value["validTo"]) &&
    (value["state"] === "VALID" ||
      value["state"] === "EXPIRED" ||
      value["state"] === "REVOKED" ||
      value["state"] === "ON_CRL") &&
    (value["revocationTime"] === undefined || isDateTime(value["revocationTime"])) &&
    (value["description"] === undefined || typeof value["description"] === "string") &&
    (value["email"] === undefined || typeof value["email"] === "string")
  );
}

function isBase64(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return encodeBase64(decodeBase64(value)) === value;
  } catch {
    return false;
  }
}

export function isPkcs12Claim(value: unknown): value is Omit<CaeetPkcs12Claim, "raw"> {
  return (
    isObject(value) &&
    isBase64(value["pkcs12"]) &&
    typeof value["password"] === "string" &&
    /^[A-Za-z0-9]{8}$/.test(value["password"]) &&
    isCertificate(value["certificate"])
  );
}

export function isUnfinishedRequests(
  value: unknown,
): value is Omit<CaeetUnfinishedRequests, "raw"> {
  return (
    isObject(value) &&
    typeof value["count"] === "number" &&
    Number.isSafeInteger(value["count"]) &&
    value["count"] >= 0 &&
    Array.isArray(value["data"]) &&
    value["data"].every(isRequestId)
  );
}
