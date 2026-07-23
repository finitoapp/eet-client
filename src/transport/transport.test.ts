import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CONTENT_TYPE, SOAP_ACTION } from "../core/namespaces.ts";
import { getOrThrow } from "../result.ts";
import { sendSoapRequest } from "./transport.ts";

function okResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers });
}

describe("sendSoapRequest", () => {
  test("sends the exact SOAPAction and Content-Type headers mandated by the spec", async () => {
    let capturedRequest: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedRequest = { url: String(url), init: init ?? {} };
      return okResponse("<ok/>");
    }) as unknown as typeof fetch;

    await sendSoapRequest({
      endpoint: "https://example.test/eet",
      body: "<soap:Envelope/>",
      fetchImpl,
    });

    assert.strictEqual(capturedRequest?.url, "https://example.test/eet");
    const headers = new Headers(capturedRequest?.init.headers);
    assert.strictEqual(headers.get("Content-Type"), CONTENT_TYPE);
    assert.strictEqual(headers.get("SOAPAction"), `"${SOAP_ACTION}"`);
    assert.strictEqual(capturedRequest?.init.method, "POST");
  });

  test("captures HTTP status, body, and X-Global-Transaction-Id", async () => {
    const fetchImpl = (async () =>
      okResponse("<ok/>", { "X-Global-Transaction-Id": "abc-123" })) as unknown as typeof fetch;

    const result = getOrThrow(
      await sendSoapRequest({
        endpoint: "https://example.test/eet",
        body: "<soap:Envelope/>",
        fetchImpl,
      }),
    );

    assert.strictEqual(result.httpStatus, 200);
    assert.strictEqual(result.bodyText, "<ok/>");
    assert.strictEqual(result.globalTransactionId, "abc-123");
  });

  test("omits globalTransactionId entirely when the header is absent", async () => {
    const fetchImpl = (async () => okResponse("<ok/>")) as unknown as typeof fetch;
    const result = getOrThrow(
      await sendSoapRequest({
        endpoint: "https://example.test/eet",
        body: "<soap:Envelope/>",
        fetchImpl,
      }),
    );
    assert.strictEqual(result.globalTransactionId, undefined);
  });

  test("rejects an oversized envelope before ever calling fetch", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return okResponse("<ok/>");
    }) as unknown as typeof fetch;

    const result = await sendSoapRequest({
      endpoint: "https://example.test/eet",
      body: "x".repeat(12_001),
      fetchImpl,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetMessageTooLargeError");
    assert.strictEqual(called, false);
  });

  test("wraps a network failure in EetNetworkError", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const result = await sendSoapRequest({
      endpoint: "https://example.test/eet",
      body: "<x/>",
      fetchImpl,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetNetworkError");
  });

  test("wraps a timeout in EetTimeoutError", async () => {
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    const result = await sendSoapRequest({
      endpoint: "https://example.test/eet",
      body: "<x/>",
      fetchImpl,
      timeoutMs: 10,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetTimeoutError");
  });

  test("classifies a non-abort failure as EetNetworkError even if the signal already aborted", async () => {
    // Regression test for bugs.md #6: the previous code classified based on the current state
    // of `controller.signal.aborted`, so a network error arriving just after the timeout expired
    // was incorrectly reported as EetTimeoutError. It should instead decide based on whether the
    // caught error itself originates from the abort (`error.name === "AbortError"`), not the
    // signal's state.
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          // The signal is already `aborted`, but the error that actually rejects fetch is
          // unrelated to the abort (e.g. a DNS/TLS failure arrived just after the timeout
          // expired).
          reject(new TypeError("network down"));
        });
      });
    }) as unknown as typeof fetch;

    const result = await sendSoapRequest({
      endpoint: "https://example.test/eet",
      body: "<x/>",
      fetchImpl,
      timeoutMs: 10,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetNetworkError");
  });

  test("rejects a response whose declared Content-Length exceeds the limit", async () => {
    // Regression test for bugs.md #7: the previous code's `await response.text()` had no
    // Content-Length check or any other limit on the size of the incoming response.
    const fetchImpl = (async () =>
      okResponse("<ok/>", { "Content-Length": "999999999" })) as unknown as typeof fetch;

    const result = await sendSoapRequest({
      endpoint: "https://example.test/eet",
      body: "<x/>",
      fetchImpl,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetMessageTooLargeError");
  });

  test("rejects an oversized response body while streaming, even without a Content-Length header", async () => {
    // Regression test for bugs.md #7: the previous code read `await response.text()` without any
    // limit on the size of the incoming response. Here the server doesn't send Content-Length at
    // all (typical for chunked transfer), so the only defense is counting bytes while reading
    // the stream.
    const chunk = new Uint8Array(600_000).fill(97); // "aaaa..."
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const fetchImpl = (async () =>
      new Response(stream, { status: 200 })) as unknown as typeof fetch;

    const result = await sendSoapRequest({
      endpoint: "https://example.test/eet",
      body: "<x/>",
      fetchImpl,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetMessageTooLargeError");
  });

  test("rejects an oversized response body when the Response has no readable body stream", async () => {
    // Regression test for bugs.md #4: a custom `fetch` (a documented extension point) can return
    // a `Response`-like object whose `body` is null/undefined (e.g. some polyfills or edge-runtime
    // implementations), which previously fell back to unbounded `response.text()`.
    const oversized = new Uint8Array(1_500_000).fill(97); // "aaaa..."
    const fakeResponse = {
      status: 200,
      headers: new Headers(),
      body: undefined,
      arrayBuffer: async () => oversized.buffer,
      text: async () => new TextDecoder().decode(oversized),
    } as unknown as Response;
    const fetchImpl = (async () => fakeResponse) as unknown as typeof fetch;

    const result = await sendSoapRequest({
      endpoint: "https://example.test/eet",
      body: "<x/>",
      fetchImpl,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetMessageTooLargeError");
  });
});
