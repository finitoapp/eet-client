import { err, ok, type Result } from "../result.ts";
import {
  type CaeetError,
  createCaeetHttpError,
  createCaeetJsonError,
  createCaeetResponseSchemaError,
} from "./errors.ts";
import { buildCaeetAuthorizationJwt } from "./jwt.ts";
import { sendCaeetRequest } from "./transport.ts";
import type {
  CaeetPkcs12Claim,
  CaeetRenewalRequest,
  CaeetRenewalRequestOptions,
  CaeetRenewalStatus,
  CaeetUnfinishedRequests,
} from "./types.ts";

/** Appends `path` to `baseUrl`'s path, preserving any query string/fragment `baseUrl` already has. */
function joinUrl(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${path}`;
  return url.toString();
}

function readStringField(body: unknown, field: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function readNumberField(body: unknown, field: string): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "number" ? value : undefined;
}

interface CaeetEndpointResult {
  readonly httpStatus: number;
  readonly body: unknown;
  readonly retryAfterSeconds?: number;
}

/**
 * Shared plumbing for every CA EET renewal endpoint: builds a fresh JWT (per-call, since `exp`
 * must be within 5 minutes of `iat`), sends the request, rejects non-2xx statuses, and parses
 * the JSON body.
 */
async function callCaeetEndpoint(
  path: string,
  method: "GET" | "POST",
  options: CaeetRenewalRequestOptions,
): Promise<Result<CaeetEndpointResult, CaeetError>> {
  const jwtResult = await buildCaeetAuthorizationJwt(options.signer, options);
  if (!jwtResult.ok) return jwtResult;

  const httpResult = await sendCaeetRequest({
    url: joinUrl(options.baseUrl, path),
    method,
    authorizationJwt: jwtResult.value,
    fetchImpl: options.fetch ?? fetch,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
  if (!httpResult.ok) return httpResult;
  const { httpStatus, bodyText, retryAfterSeconds } = httpResult.value;

  if (httpStatus < 200 || httpStatus >= 300) {
    return err(
      createCaeetHttpError({
        message: `Unexpected HTTP status ${httpStatus} from ${method} ${path}.`,
        httpStatus,
        cause: bodyText,
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      }),
    );
  }

  let body: unknown;
  if (bodyText.length > 0) {
    try {
      body = JSON.parse(bodyText);
    } catch (error) {
      return err(
        createCaeetJsonError({
          message: `Response body from ${method} ${path} was not valid JSON.`,
          httpStatus,
          cause: error,
        }),
      );
    }
  }

  return ok({
    httpStatus,
    body,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });
}

/** `POST /request/renew` — submits a renewal request, signed by the certificate being renewed. */
export async function requestCaeetRenewal(
  options: CaeetRenewalRequestOptions,
): Promise<Result<CaeetRenewalRequest, CaeetError>> {
  const result = await callCaeetEndpoint("/request/renew", "POST", options);
  if (!result.ok) return result;

  const reqId = readStringField(result.value.body, "reqId");
  if (reqId === undefined) {
    return err(
      createCaeetResponseSchemaError({
        message: "Response from POST /request/renew did not contain a string reqId field.",
        httpStatus: result.value.httpStatus,
      }),
    );
  }
  return ok({ reqId, raw: result.value.body });
}

/** `GET /request/{reqId}/status` — current status of a previously submitted renewal request. */
export async function getCaeetRenewalStatus(
  reqId: string,
  options: CaeetRenewalRequestOptions,
): Promise<Result<CaeetRenewalStatus, CaeetError>> {
  const result = await callCaeetEndpoint(
    `/request/${encodeURIComponent(reqId)}/status`,
    "GET",
    options,
  );
  if (!result.ok) return result;

  const pollAfterSeconds = readNumberField(result.value.body, "pollAfterSeconds");
  return ok({
    ...(pollAfterSeconds !== undefined ? { pollAfterSeconds } : {}),
    ...(result.value.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: result.value.retryAfterSeconds }
      : {}),
    raw: result.value.body,
  });
}

/**
 * `POST /request/{reqId}/claim-download` — downloads the issued PKCS#12 and its password. Only
 * valid while the request is `ISSUED`/`DELIVERING`, per the reference document. The returned
 * data is highly sensitive — see {@link CaeetPkcs12Claim}.
 */
export async function claimCaeetPkcs12(
  reqId: string,
  options: CaeetRenewalRequestOptions,
): Promise<Result<CaeetPkcs12Claim, CaeetError>> {
  const result = await callCaeetEndpoint(
    `/request/${encodeURIComponent(reqId)}/claim-download`,
    "POST",
    options,
  );
  if (!result.ok) return result;
  return ok({ raw: result.value.body });
}

/**
 * `POST /request/{reqId}/ack-download` — confirms the PKCS#12 was received; only valid while
 * `DELIVERING`. After this call the data can no longer be re-fetched via {@link claimCaeetPkcs12}.
 */
export async function ackCaeetPkcs12Download(
  reqId: string,
  options: CaeetRenewalRequestOptions,
): Promise<Result<{ raw: unknown }, CaeetError>> {
  const result = await callCaeetEndpoint(
    `/request/${encodeURIComponent(reqId)}/ack-download`,
    "POST",
    options,
  );
  if (!result.ok) return result;
  return ok({ raw: result.value.body });
}

/** `GET /request/not-finished` — all requests still `INPROCESS`, `ISSUED`, or `DELIVERING`. */
export async function listUnfinishedCaeetRequests(
  options: CaeetRenewalRequestOptions,
): Promise<Result<CaeetUnfinishedRequests, CaeetError>> {
  const result = await callCaeetEndpoint("/request/not-finished", "GET", options);
  if (!result.ok) return result;
  return ok({ raw: result.value.body });
}
