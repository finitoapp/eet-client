import { fetchWithTimeout, MAX_RESPONSE_BYTES } from "../core/http.ts";
import { ok, type Result } from "../result.ts";
import {
  type CaeetNetworkError,
  type CaeetResponseTooLargeError,
  type CaeetTimeoutError,
  createCaeetNetworkError,
  createCaeetResponseTooLargeError,
  createCaeetTimeoutError,
} from "./errors.ts";

export interface SendCaeetRequestOptions {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly authorizationJwt: string;
  readonly fetchImpl: typeof fetch;
  /** Request timeout in milliseconds. No timeout is applied when omitted. */
  readonly timeoutMs?: number;
}

export interface CaeetHttpResponse {
  readonly httpStatus: number;
  readonly bodyText: string;
  readonly retryAfterSeconds?: number;
}

/** Parses a `Retry-After` header value as delta-seconds; returns `undefined` for anything else
 * (e.g. an HTTP-date, which this API isn't documented to use). */
function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
  if (headerValue === null || !/^\d+$/.test(headerValue)) return undefined;
  return Number(headerValue);
}

/**
 * Sends one authenticated JSON request to the CA EET renewal API. Never returns an `Err` for a
 * non-2xx HTTP status by itself — that is left to the caller, since this API's error bodies
 * aren't documented well enough for this SDK to interpret them itself (see `endpoints.ts`).
 */
export async function sendCaeetRequest(
  options: SendCaeetRequestOptions,
): Promise<
  Result<CaeetHttpResponse, CaeetNetworkError | CaeetTimeoutError | CaeetResponseTooLargeError>
> {
  const result = await fetchWithTimeout(
    {
      url: options.url,
      init: {
        method: options.method,
        headers: {
          Authorization: `Bearer ${options.authorizationJwt}`,
          Accept: "application/json",
        },
      },
      fetchImpl: options.fetchImpl,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      limitBytes: MAX_RESPONSE_BYTES,
    },
    {
      tooLarge: (message, byteLength, limitBytes) =>
        createCaeetResponseTooLargeError({ message, byteLength, limitBytes }),
      timeout: (message, cause) => createCaeetTimeoutError({ message, cause }),
      network: (message, cause) => createCaeetNetworkError({ message, cause }),
    },
  );
  if (!result.ok) return result;

  const { response, bodyText } = result.value;
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("Retry-After"));
  return ok({
    httpStatus: response.status,
    bodyText,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });
}
