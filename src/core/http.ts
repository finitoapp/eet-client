/**
 * Shared HTTP request/response plumbing. Used by both the EET SOAP transport
 * (`transport/transport.ts`) and the CA EET renewal REST transport
 * (`caeet-renewal/transport.ts`) so a malicious or misbehaving server/proxy on a custom
 * `endpoint`/`baseUrl`/`fetch` can't exhaust memory with an unbounded response, and so timeout
 * wiring and network/timeout/too-large error classification aren't duplicated between the two
 * transports.
 */

import { err, ok, type Result } from "../result.ts";

/**
 * Internal signal thrown by {@link readBoundedBodyText}; never escapes {@link fetchWithTimeout},
 * the only caller.
 */
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
 * Defensive upper bound on the size of a response body read into memory for either transport.
 * Not mandated by the EET XSD or the CA EET renewal API's documentation — real responses from
 * both are a few kB at most — it only guards against a malicious or misbehaving server/proxy on a
 * custom `endpoint`/`baseUrl`/`fetch` exhausting memory with an unbounded response.
 */
export const MAX_RESPONSE_BYTES = 1_000_000;

export interface FetchWithTimeoutOptions {
  readonly url: string;
  /** `signal` is fetchWithTimeout's own to set (from `timeoutMs`) — omit it here. */
  readonly init: Omit<RequestInit, "signal">;
  readonly fetchImpl: typeof fetch;
  /** Request timeout in milliseconds. No timeout is applied when omitted. */
  readonly timeoutMs?: number;
  /** Passed through to {@link readBoundedBodyText}. */
  readonly limitBytes: number;
}

export interface FetchWithTimeoutResult {
  readonly response: Response;
  readonly bodyText: string;
}

/**
 * Builds the typed error returned for each failure mode {@link fetchWithTimeout} can classify.
 * Each callback receives a ready-to-use `message` (fetchWithTimeout owns the wording, so it isn't
 * duplicated across callers) and just wraps it in the caller's own error factory/type.
 */
export interface FetchWithTimeoutErrors<TTooLarge, TTimeout, TNetwork> {
  tooLarge(message: string, byteLength: number, limitBytes: number): TTooLarge;
  timeout(message: string, cause: unknown): TTimeout;
  network(message: string, cause: unknown): TNetwork;
}

/**
 * Sends one HTTP request with an optional timeout, reads its body via {@link readBoundedBodyText},
 * and classifies any failure (oversized body, abort/timeout, or any other network failure) into a
 * caller-supplied typed error via `errors`. Shared by both transports so timeout wiring, message
 * wording, and error classification aren't duplicated: only the request shape (headers/method/body)
 * and the specific error types differ between them.
 */
export async function fetchWithTimeout<TTooLarge, TTimeout, TNetwork>(
  options: FetchWithTimeoutOptions,
  errors: FetchWithTimeoutErrors<TTooLarge, TTimeout, TNetwork>,
): Promise<Result<FetchWithTimeoutResult, TTooLarge | TTimeout | TNetwork>> {
  const timeoutMs = options.timeoutMs;
  const controller = timeoutMs !== undefined ? new AbortController() : undefined;
  const timeoutHandle =
    controller !== undefined ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await options.fetchImpl(options.url, {
      ...options.init,
      ...(controller !== undefined ? { signal: controller.signal } : {}),
    });
    const bodyText = await readBoundedBodyText(response, options.limitBytes);
    return ok({ response, bodyText });
  } catch (error) {
    if (error instanceof ResponseTooLargeSignal) {
      const { byteLength } = error;
      const { limitBytes } = options;
      return err(
        errors.tooLarge(
          `Response body is ${byteLength} bytes, limit is ${limitBytes} bytes.`,
          byteLength,
          limitBytes,
        ),
      );
    }
    if (
      controller !== undefined &&
      timeoutMs !== undefined &&
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      return err(
        errors.timeout(`Request to ${options.url} timed out after ${timeoutMs} ms.`, error),
      );
    }
    return err(errors.network(`Request to ${options.url} failed.`, error));
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
