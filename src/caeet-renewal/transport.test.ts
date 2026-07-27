import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getOrThrow } from "../result.ts";
import { sendCaeetRequest } from "./transport.ts";

function jsonResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers });
}

describe("sendCaeetRequest", () => {
  test("sends a Bearer Authorization header and Accept: application/json", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return jsonResponse("{}");
    }) as unknown as typeof fetch;

    await sendCaeetRequest({
      url: "https://example.test/request/renew",
      method: "POST",
      authorizationJwt: "header.payload.signature",
      fetchImpl,
    });

    const headers = new Headers(capturedInit?.headers);
    assert.strictEqual(headers.get("Authorization"), "Bearer header.payload.signature");
    assert.strictEqual(headers.get("Accept"), "application/json");
    assert.strictEqual(capturedInit?.method, "POST");
  });

  test("captures HTTP status, body, and a numeric Retry-After header", async () => {
    const fetchImpl = (async () =>
      jsonResponse('{"reqId":"abc"}', { "Retry-After": "30" })) as unknown as typeof fetch;

    const result = getOrThrow(
      await sendCaeetRequest({
        url: "https://example.test/x",
        method: "GET",
        authorizationJwt: "jwt",
        fetchImpl,
      }),
    );

    assert.strictEqual(result.httpStatus, 200);
    assert.strictEqual(result.bodyText, '{"reqId":"abc"}');
    assert.strictEqual(result.retryAfterSeconds, 30);
  });

  test("omits retryAfterSeconds when the header is absent or not delta-seconds", async () => {
    const fetchImpl = (async () => jsonResponse("{}")) as unknown as typeof fetch;
    const result = getOrThrow(
      await sendCaeetRequest({
        url: "https://example.test/x",
        method: "GET",
        authorizationJwt: "jwt",
        fetchImpl,
      }),
    );
    assert.strictEqual(result.retryAfterSeconds, undefined);
  });

  test("wraps a network failure in CaeetNetworkError", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const result = await sendCaeetRequest({
      url: "https://example.test/x",
      method: "GET",
      authorizationJwt: "jwt",
      fetchImpl,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetNetworkError");
  });

  test("wraps a timeout in CaeetTimeoutError", async () => {
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    const result = await sendCaeetRequest({
      url: "https://example.test/x",
      method: "GET",
      authorizationJwt: "jwt",
      fetchImpl,
      timeoutMs: 10,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetTimeoutError");
  });

  test("rejects a response whose declared Content-Length exceeds the limit", async () => {
    const fetchImpl = (async () =>
      jsonResponse("{}", { "Content-Length": "999999999" })) as unknown as typeof fetch;

    const result = await sendCaeetRequest({
      url: "https://example.test/x",
      method: "GET",
      authorizationJwt: "jwt",
      fetchImpl,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetResponseTooLargeError");
  });
});
