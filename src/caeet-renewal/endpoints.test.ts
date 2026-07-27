import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeBase64Url } from "../core/base64.ts";
import { getOrThrow } from "../result.ts";
import {
  ackCaeetPkcs12Download,
  claimCaeetPkcs12,
  getCaeetRenewalStatus,
  listUnfinishedCaeetRequests,
  requestCaeetRenewal,
} from "./endpoints.ts";
import type { CaeetSigner } from "./types.ts";

function fakeSigner(): CaeetSigner {
  return {
    getCertificate: () => new Uint8Array([1, 2, 3]),
    sign: async () => new Uint8Array([9, 9, 9]),
  };
}

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function fetchReturning(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): { fetch: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status, headers });
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, captured };
}

describe("requestCaeetRenewal", () => {
  test("returns reqId and raw body on success", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning('{"reqId":"req-1"}');
    const result = getOrThrow(
      await requestCaeetRenewal({
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.strictEqual(result.reqId, "req-1");
    assert.deepStrictEqual(result.raw, { reqId: "req-1" });
    assert.strictEqual(captured[0]?.url, "https://example.test/request/renew");
    assert.strictEqual(captured[0]?.init.method, "POST");
  });

  test("normalizes a trailing slash on baseUrl", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning('{"reqId":"req-1"}');
    await requestCaeetRenewal({
      baseUrl: "https://example.test/",
      signer: fakeSigner(),
      fetch: fetchImpl,
    });
    assert.strictEqual(captured[0]?.url, "https://example.test/request/renew");
  });

  test("preserves baseUrl's path and query string", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning('{"reqId":"req-1"}');
    await requestCaeetRenewal({
      baseUrl: "https://example.test/api?tenant=1",
      signer: fakeSigner(),
      fetch: fetchImpl,
    });
    assert.strictEqual(captured[0]?.url, "https://example.test/api/request/renew?tenant=1");
  });

  test("fails with CaeetResponseSchemaError when reqId is missing", async () => {
    const { fetch: fetchImpl } = fetchReturning("{}");
    const result = await requestCaeetRenewal({
      baseUrl: "https://example.test",
      signer: fakeSigner(),
      fetch: fetchImpl,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetResponseSchemaError");
  });

  test("fails with CaeetJsonError on malformed JSON", async () => {
    const { fetch: fetchImpl } = fetchReturning("not json");
    const result = await requestCaeetRenewal({
      baseUrl: "https://example.test",
      signer: fakeSigner(),
      fetch: fetchImpl,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "CaeetJsonError");
  });

  test("fails with CaeetHttpError on a non-2xx status", async () => {
    const { fetch: fetchImpl } = fetchReturning('{"error":"nope"}', 401);
    const result = await requestCaeetRenewal({
      baseUrl: "https://example.test",
      signer: fakeSigner(),
      fetch: fetchImpl,
    });
    assert.strictEqual(result.ok, false);
    if (result.ok) return;
    assert.strictEqual(result.error.type, "CaeetHttpError");
    if (result.error.type === "CaeetHttpError") {
      assert.strictEqual(result.error.httpStatus, 401);
    }
  });

  test("CaeetHttpError on a non-2xx status carries the response body and Retry-After", async () => {
    const { fetch: fetchImpl } = fetchReturning('{"error":"rate_limited"}', 429, {
      "Retry-After": "30",
    });
    const result = await requestCaeetRenewal({
      baseUrl: "https://example.test",
      signer: fakeSigner(),
      fetch: fetchImpl,
    });
    assert.strictEqual(result.ok, false);
    if (result.ok) return;
    assert.strictEqual(result.error.type, "CaeetHttpError");
    if (result.error.type === "CaeetHttpError") {
      assert.strictEqual(result.error.cause, '{"error":"rate_limited"}');
      assert.strictEqual(result.error.retryAfterSeconds, 30);
    }
  });

  test("passes ttlSeconds through to the signed JWT", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning('{"reqId":"req-1"}');
    await requestCaeetRenewal({
      baseUrl: "https://example.test",
      signer: fakeSigner(),
      fetch: fetchImpl,
      ttlSeconds: 120,
    });
    const headers = new Headers(captured[0]?.init.headers);
    const authorization = headers.get("Authorization") ?? "";
    const [, payloadB64] = authorization.replace(/^Bearer /, "").split(".");
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadB64 ?? ""))) as {
      iat: number;
      exp: number;
    };
    assert.strictEqual(payload.exp - payload.iat, 120);
  });
});

describe("getCaeetRenewalStatus", () => {
  test("extracts pollAfterSeconds and retryAfterSeconds, encodes reqId in the URL", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning('{"pollAfterSeconds":5}', 200, {
      "Retry-After": "5",
    });
    const result = getOrThrow(
      await getCaeetRenewalStatus("req/1", {
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.strictEqual(result.pollAfterSeconds, 5);
    assert.strictEqual(result.retryAfterSeconds, 5);
    assert.strictEqual(captured[0]?.url, "https://example.test/request/req%2F1/status");
    assert.strictEqual(captured[0]?.init.method, "GET");
  });

  test("omits pollAfterSeconds when absent from the body", async () => {
    const { fetch: fetchImpl } = fetchReturning('{"whatever":true}');
    const result = getOrThrow(
      await getCaeetRenewalStatus("req-1", {
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.strictEqual(result.pollAfterSeconds, undefined);
    assert.deepStrictEqual(result.raw, { whatever: true });
  });
});

describe("claimCaeetPkcs12", () => {
  test("passes the parsed body through as raw", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning(
      '{"pkcs12":"base64...","password":"secret"}',
    );
    const result = getOrThrow(
      await claimCaeetPkcs12("req-1", {
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.deepStrictEqual(result.raw, { pkcs12: "base64...", password: "secret" });
    assert.strictEqual(captured[0]?.url, "https://example.test/request/req-1/claim-download");
    assert.strictEqual(captured[0]?.init.method, "POST");
  });
});

describe("ackCaeetPkcs12Download", () => {
  test("succeeds with an empty body", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning("");
    const result = getOrThrow(
      await ackCaeetPkcs12Download("req-1", {
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.strictEqual(result.raw, undefined);
    assert.strictEqual(captured[0]?.url, "https://example.test/request/req-1/ack-download");
    assert.strictEqual(captured[0]?.init.method, "POST");
  });
});

describe("listUnfinishedCaeetRequests", () => {
  test("passes the parsed body through as raw", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning('["req-1","req-2"]');
    const result = getOrThrow(
      await listUnfinishedCaeetRequests({
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.deepStrictEqual(result.raw, ["req-1", "req-2"]);
    assert.strictEqual(captured[0]?.url, "https://example.test/request/not-finished");
    assert.strictEqual(captured[0]?.init.method, "GET");
  });
});
