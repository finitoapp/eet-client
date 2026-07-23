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
 * Defensive upper bound on the size of a response body read into memory. Unlike
 * {@link MAX_MESSAGE_BYTES}, this is not mandated by the EET XSD — real EET responses are a few
 * kB at most — it only guards against a malicious or misbehaving server/proxy on a custom
 * `endpoint`/`fetch` exhausting memory with an unbounded response.
 */
const MAX_RESPONSE_BYTES = 1_000_000;

/** Internal signal thrown by {@link readBoundedBodyText}; never escapes {@link sendSoapRequest}. */
class ResponseTooLargeSignal {
  readonly byteLength: number;
  constructor(byteLength: number) {
    this.byteLength = byteLength;
  }
}

/**
 * Reads `response`'s body as text, aborting as soon as more than `limitBytes` have been read
 * (via `Content-Length` when present, and always while streaming) instead of buffering an
 * unbounded body via `response.text()`. When a custom `fetch` returns a `Response` without a
 * readable stream (`body: null`), falls back to `arrayBuffer()` and enforces `limitBytes` against
 * its `byteLength` before decoding, rather than silently allowing unbounded buffering.
 */
async function readBoundedBodyText(response: Response, limitBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw new ResponseTooLargeSignal(contentLength);
  }

  const reader = response.body?.getReader();
  if (reader === undefined) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > limitBytes) {
      throw new ResponseTooLargeSignal(buffer.byteLength);
    }
    return new TextDecoder().decode(buffer);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limitBytes) {
      await reader.cancel();
      throw new ResponseTooLargeSignal(total);
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(combined);
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

  const controller = options.timeoutMs !== undefined ? new AbortController() : undefined;
  const timeoutHandle =
    controller !== undefined ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;

  let httpStatus: number;
  let bodyText: string;
  let globalTransactionId: string | undefined;
  try {
    const response = await options.fetchImpl(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": CONTENT_TYPE,
        SOAPAction: `"${SOAP_ACTION}"`,
      },
      body: bodyBytes as BodyInit,
      ...(controller !== undefined ? { signal: controller.signal } : {}),
    });
    httpStatus = response.status;
    globalTransactionId = response.headers.get("X-Global-Transaction-Id") ?? undefined;
    bodyText = await readBoundedBodyText(response, MAX_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ResponseTooLargeSignal) {
      return err(
        createEetMessageTooLargeError({
          message: `Response body is ${error.byteLength} bytes, limit is ${MAX_RESPONSE_BYTES} bytes.`,
          byteLength: error.byteLength,
          limitBytes: MAX_RESPONSE_BYTES,
        }),
      );
    }
    if (controller !== undefined && error instanceof Error && error.name === "AbortError") {
      return err(
        createEetTimeoutError({
          message: `Request to ${options.endpoint} timed out after ${options.timeoutMs} ms.`,
          cause: error,
        }),
      );
    }
    return err(
      createEetNetworkError({
        message: `Request to ${options.endpoint} failed.`,
        cause: error,
      }),
    );
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }

  return ok({
    httpStatus,
    bodyText,
    ...(globalTransactionId !== undefined ? { globalTransactionId } : {}),
  });
}
