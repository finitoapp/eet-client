import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { err, isErr, isOk, ok } from "./result.ts";

describe("isOk", () => {
  test("returns true for an Ok result", () => {
    assert.strictEqual(isOk(ok(1)), true);
  });

  test("returns false for an Err result", () => {
    assert.strictEqual(isOk(err("boom")), false);
  });
});

describe("isErr", () => {
  test("returns true for an Err result", () => {
    assert.strictEqual(isErr(err("boom")), true);
  });

  test("returns false for an Ok result", () => {
    assert.strictEqual(isErr(ok(1)), false);
  });
});
