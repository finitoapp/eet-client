import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CAEET_OTHER_REQUEST_ID,
  CAEET_PKCS12_CLAIM,
  CAEET_REQUEST_ID,
} from "../../test/caeet-fixtures.ts";
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
    const { fetch: fetchImpl, captured } = fetchReturning(
      JSON.stringify({ reqId: CAEET_REQUEST_ID }),
    );
    const result = getOrThrow(
      await requestCaeetRenewal({
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.strictEqual(result.reqId, CAEET_REQUEST_ID);
    assert.deepStrictEqual(result.raw, { reqId: CAEET_REQUEST_ID });
    assert.strictEqual(captured[0]?.url, "https://example.test/request/renew");
    assert.strictEqual(captured[0]?.init.method, "POST");
  });

  test("normalizes a trailing slash on baseUrl", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning(
      JSON.stringify({ reqId: CAEET_REQUEST_ID }),
    );
    await requestCaeetRenewal({
      baseUrl: "https://example.test/",
      signer: fakeSigner(),
      fetch: fetchImpl,
    });
    assert.strictEqual(captured[0]?.url, "https://example.test/request/renew");
  });

  test("preserves baseUrl's path and query string", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning(
      JSON.stringify({ reqId: CAEET_REQUEST_ID }),
    );
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
    const { fetch: fetchImpl, captured } = fetchReturning(
      JSON.stringify({ reqId: CAEET_REQUEST_ID }),
    );
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
    const { fetch: fetchImpl, captured } = fetchReturning(
      JSON.stringify({ reqId: CAEET_REQUEST_ID, state: "INPROCESS", pollAfterSeconds: 5 }),
      200,
      {
        "Retry-After": "5",
      },
    );
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
    const { fetch: fetchImpl } = fetchReturning(
      JSON.stringify({ reqId: CAEET_REQUEST_ID, state: "ISSUED" }),
    );
    const result = getOrThrow(
      await getCaeetRenewalStatus("req-1", {
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.strictEqual(result.pollAfterSeconds, undefined);
    assert.deepStrictEqual(result.raw, { reqId: CAEET_REQUEST_ID, state: "ISSUED" });
  });
});

describe("claimCaeetPkcs12", () => {
  test("returns validated fields and the raw body", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning(JSON.stringify(CAEET_PKCS12_CLAIM));
    const result = getOrThrow(
      await claimCaeetPkcs12("req-1", {
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.deepStrictEqual(result.raw, CAEET_PKCS12_CLAIM);
    assert.strictEqual(result.pkcs12, CAEET_PKCS12_CLAIM.pkcs12);
    assert.strictEqual(result.password, CAEET_PKCS12_CLAIM.password);
    assert.deepStrictEqual(result.certificate, CAEET_PKCS12_CLAIM.certificate);
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
  test("returns validated fields and the raw body", async () => {
    const { fetch: fetchImpl, captured } = fetchReturning(
      JSON.stringify({ count: 2, data: [CAEET_REQUEST_ID, CAEET_OTHER_REQUEST_ID] }),
    );
    const result = getOrThrow(
      await listUnfinishedCaeetRequests({
        baseUrl: "https://example.test",
        signer: fakeSigner(),
        fetch: fetchImpl,
      }),
    );
    assert.strictEqual(result.count, 2);
    assert.deepStrictEqual(result.data, [CAEET_REQUEST_ID, CAEET_OTHER_REQUEST_ID]);
    assert.deepStrictEqual(result.raw, { count: 2, data: result.data });
    assert.strictEqual(captured[0]?.url, "https://example.test/request/not-finished");
    assert.strictEqual(captured[0]?.init.method, "GET");
  });
});

describe("OpenAPI response validation", () => {
  const options = { baseUrl: "https://example.test/api", signer: fakeSigner() };

  for (const state of ["INPROCESS", "ISSUED", "DELIVERING", "FINISHED", "REJECTED"] as const) {
    test(`reads the ${state} state and retains raw extensions`, async () => {
      const body = {
        reqId: CAEET_REQUEST_ID,
        state,
        ...(state === "INPROCESS" ? { pollAfterSeconds: 2 } : {}),
        ...(state === "REJECTED" ? { rejectedReason: "Certificate rejected." } : {}),
        extension: true,
        retryAfterSeconds: "untrusted-body-field",
      };
      const result = getOrThrow(
        await getCaeetRenewalStatus(CAEET_REQUEST_ID, {
          ...options,
          fetch: fetchReturning(JSON.stringify(body)).fetch,
        }),
      );
      assert.equal(result.reqId, CAEET_REQUEST_ID);
      assert.equal(result.state, state);
      assert.deepEqual(result.raw, body);
      assert.equal(result.retryAfterSeconds, undefined);
      if (result.state === "INPROCESS") assert.equal(result.pollAfterSeconds, 2);
      if (result.state === "REJECTED") assert.equal(result.rejectedReason, "Certificate rejected.");
    });
  }

  const invalidRequests: ReadonlyArray<unknown> = [
    null,
    [],
    {},
    { reqId: "" },
    { reqId: "req-1" },
    { reqId: 123 },
  ];
  const invalidStatuses: ReadonlyArray<unknown> = [
    null,
    [],
    "ISSUED",
    {},
    { reqId: CAEET_REQUEST_ID },
    { reqId: "invalid", state: "ISSUED" },
    { reqId: CAEET_REQUEST_ID, state: "UNKNOWN" },
    { reqId: CAEET_REQUEST_ID, state: "INPROCESS" },
    ...[0, -1, 1.5, "2", null, 1e100].map((pollAfterSeconds) => ({
      reqId: CAEET_REQUEST_ID,
      state: "INPROCESS",
      pollAfterSeconds,
    })),
    { reqId: CAEET_REQUEST_ID, state: "REJECTED" },
    { reqId: CAEET_REQUEST_ID, state: "REJECTED", rejectedReason: 1 },
  ];
  const invalidClaims: ReadonlyArray<unknown> = [
    null,
    [],
    {},
    ...[undefined, 1, "!", "AB=="].map((pkcs12) => ({ ...CAEET_PKCS12_CLAIM, pkcs12 })),
    ...[undefined, null, "secret", "ABcd12!?"].map((password) => ({
      ...CAEET_PKCS12_CLAIM,
      password,
    })),
    ...[
      undefined,
      null,
      {},
      { ...CAEET_PKCS12_CLAIM.certificate, sn: 123 },
      { ...CAEET_PKCS12_CLAIM.certificate, sn: "not-numeric" },
      { ...CAEET_PKCS12_CLAIM.certificate, state: "UNKNOWN" },
      { ...CAEET_PKCS12_CLAIM.certificate, validFrom: "2026-02-30T00:00:00Z" },
      { ...CAEET_PKCS12_CLAIM.certificate, validTo: "not-a-date" },
      { ...CAEET_PKCS12_CLAIM.certificate, revocationTime: 123 },
      { ...CAEET_PKCS12_CLAIM.certificate, description: null },
      { ...CAEET_PKCS12_CLAIM.certificate, email: false },
    ].map((certificate) => ({ ...CAEET_PKCS12_CLAIM, certificate })),
  ];
  const invalidLists: ReadonlyArray<unknown> = [
    null,
    [],
    [CAEET_REQUEST_ID],
    {},
    { count: 0 },
    { data: [] },
    { count: -1, data: [] },
    { count: 1.5, data: [] },
    { count: "0", data: [] },
    { count: 0, data: null },
    { count: 1, data: ["bad-id"] },
    { count: 1, data: [123] },
  ];
  const cases = [
    {
      name: "renewal",
      bodies: invalidRequests,
      call: (fetch: typeof globalThis.fetch) => requestCaeetRenewal({ ...options, fetch }),
    },
    {
      name: "status",
      bodies: invalidStatuses,
      call: (fetch: typeof globalThis.fetch) =>
        getCaeetRenewalStatus(CAEET_REQUEST_ID, { ...options, fetch }),
    },
    {
      name: "claim",
      bodies: invalidClaims,
      call: (fetch: typeof globalThis.fetch) =>
        claimCaeetPkcs12(CAEET_REQUEST_ID, { ...options, fetch }),
    },
    {
      name: "unfinished",
      bodies: invalidLists,
      call: (fetch: typeof globalThis.fetch) => listUnfinishedCaeetRequests({ ...options, fetch }),
    },
  ];
  for (const scenario of cases) {
    test(`rejects invalid ${scenario.name} bodies without exposing their contents`, async () => {
      for (const body of [...scenario.bodies, undefined]) {
        const result = await scenario.call(fetchReturning(JSON.stringify(body) ?? "").fetch);
        assert.equal(result.ok, false);
        if (result.ok) throw new Error("Expected response schema validation to fail.");
        assert.partialDeepStrictEqual(result.error, {
          type: "CaeetResponseSchemaError",
          httpStatus: 200,
        });
        const serialized = JSON.stringify(result.error);
        assert.equal(serialized.includes(CAEET_PKCS12_CLAIM.password), false);
        assert.equal(serialized.includes(CAEET_PKCS12_CLAIM.pkcs12), false);
      }
    });
  }

  test("accepts an empty unfinished list", async () => {
    const result = getOrThrow(
      await listUnfinishedCaeetRequests({
        ...options,
        fetch: fetchReturning('{"count":0,"data":[]}').fetch,
      }),
    );
    assert.deepEqual(result.data, []);
    assert.equal(result.count, 0);
  });

  test("accepts all certificate states and optional metadata", async () => {
    for (const state of ["VALID", "EXPIRED", "REVOKED", "ON_CRL"]) {
      const certificate = {
        ...CAEET_PKCS12_CLAIM.certificate,
        state,
        revocationTime: "2026-02-04T13:13:33Z",
        description: "Certificate",
        email: "test@example.test",
      };
      const result = getOrThrow(
        await claimCaeetPkcs12(CAEET_REQUEST_ID, {
          ...options,
          fetch: fetchReturning(JSON.stringify({ ...CAEET_PKCS12_CLAIM, certificate })).fetch,
        }),
      );
      assert.deepEqual(result.certificate, certificate);
    }
  });
});
