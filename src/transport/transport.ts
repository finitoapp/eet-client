import { fetchWithTimeout, MAX_RESPONSE_BYTES } from "../core/http.ts";
import { CONTENT_TYPE, SOAP_ACTION } from "../core/namespaces.ts";
import { MAX_MESSAGE_BYTES } from "../core/patterns.ts";
import { err, ok, type Result } from "../result.ts";
import {
  createEetMessageTooLargeError,
  createEetNetworkError,
  createEetTimeoutError,
  type EetMessageTooLargeError,
  type EetNetworkError,
  type EetTimeoutError,
} from "../types/errors.ts";

export interface SendSoapRequestOptions {
  readonly endpoint: string;
  /** Fully assembled, signed SOAP envelope. */
  readonly body: string;
  readonly fetchImpl: typeof fetch;
  /** Request timeout in milliseconds. No timeout is applied when omitted. */
  readonly timeoutMs?: number;
}

export interface SoapHttpResponse {
  readonly httpStatus: number;
  readonly bodyText: string;
  readonly globalTransactionId?: string;
}

/**
 * Sends the signed SOAP envelope over HTTP with the headers mandated by the EET specification
 * (`SOAPAction`, `Content-Type: text/xml; charset=utf-8`), after checking the 12 kB UTF-8 size
 * limit. Never returns an `Err` for a non-2xx HTTP status by itself — that is left to response
 * parsing, since an EET error response can be a normal, well-formed body.
 */
export async function sendSoapRequest(
  options: SendSoapRequestOptions,
): Promise<Result<SoapHttpResponse, EetMessageTooLargeError | EetNetworkError | EetTimeoutError>> {
  const bodyBytes = new TextEncoder().encode(options.body);
  if (bodyBytes.length > MAX_MESSAGE_BYTES) {
    return err(
      createEetMessageTooLargeError({
        message: `Signed SOAP envelope is ${bodyBytes.length} bytes, limit is ${MAX_MESSAGE_BYTES} bytes.`,
        byteLength: bodyBytes.length,
        limitBytes: MAX_MESSAGE_BYTES,
      }),
    );
  }

  const result = await fetchWithTimeout(
    {
      url: options.endpoint,
      init: {
        method: "POST",
        headers: {
          "Content-Type": CONTENT_TYPE,
          SOAPAction: `"${SOAP_ACTION}"`,
        },
        body: bodyBytes as BodyInit,
      },
      fetchImpl: options.fetchImpl,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      limitBytes: MAX_RESPONSE_BYTES,
    },
    {
      tooLarge: (message, byteLength, limitBytes) =>
        createEetMessageTooLargeError({ message, byteLength, limitBytes }),
      timeout: (message, cause) => createEetTimeoutError({ message, cause }),
      network: (message, cause) => createEetNetworkError({ message, cause }),
    },
  );
  if (!result.ok) return result;

  const { response, bodyText } = result.value;
  const globalTransactionId = response.headers.get("X-Global-Transaction-Id") ?? undefined;

  return ok({
    httpStatus: response.status,
    bodyText,
    ...(globalTransactionId !== undefined ? { globalTransactionId } : {}),
  });
}
