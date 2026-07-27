import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getOrThrow } from "../result.ts";
import { createCaeetRenewalClient } from "./client.ts";
import type { CaeetSigner } from "./types.ts";

function fakeSigner(): CaeetSigner {
  return {
    getCertificate: () => new Uint8Array([1, 2, 3]),
    sign: async () => new Uint8Array([9, 9, 9]),
  };
}

function fetchReturning(body: string, status = 200): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("createCaeetRenewalClient", () => {
  test("throws when baseUrl is missing", () => {
    assert.throws(() =>
      createCaeetRenewalClient({
        baseUrl: "",
        signer: fakeSigner(),
      }),
    );
  });

  test("throws when signer is missing", () => {
    assert.throws(() =>
      createCaeetRenewalClient({
        baseUrl: "https://example.test",
        signer: undefined as unknown as CaeetSigner,
      }),
    );
  });

  test("requestRenewal() delegates to the /request/renew endpoint", async () => {
    const client = createCaeetRenewalClient({
      baseUrl: "https://example.test",
      signer: fakeSigner(),
      fetch: fetchReturning('{"reqId":"req-1"}'),
    });
    const result = getOrThrow(await client.requestRenewal());
    assert.strictEqual(result.reqId, "req-1");
  });

  test("getStatus()/claimPkcs12()/ackDownload()/listUnfinished() all resolve via the shared options", async () => {
    const client = createCaeetRenewalClient({
      baseUrl: "https://example.test",
      signer: fakeSigner(),
      fetch: fetchReturning("{}"),
    });
    assert.strictEqual((await client.getStatus("req-1")).ok, true);
    assert.strictEqual((await client.claimPkcs12("req-1")).ok, true);
    assert.strictEqual((await client.ackDownload("req-1")).ok, true);
    assert.strictEqual((await client.listUnfinished()).ok, true);
  });
});
