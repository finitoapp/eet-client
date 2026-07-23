import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bytesEqual } from "./bytes.ts";

describe("bytesEqual", () => {
  test("returns true for two empty arrays", () => {
    assert.strictEqual(bytesEqual(new Uint8Array([]), new Uint8Array([])), true);
  });

  test("returns true for identical byte sequences", () => {
    assert.strictEqual(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  });

  test("returns false for different lengths, even when the shorter is a prefix of the longer", () => {
    assert.strictEqual(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])), false);
    assert.strictEqual(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false);
  });

  test("returns false when a single byte differs at the start", () => {
    assert.strictEqual(bytesEqual(new Uint8Array([9, 2, 3]), new Uint8Array([1, 2, 3])), false);
  });

  test("returns false when a single byte differs in the middle", () => {
    assert.strictEqual(bytesEqual(new Uint8Array([1, 9, 3]), new Uint8Array([1, 2, 3])), false);
  });

  test("returns false when a single byte differs at the end", () => {
    assert.strictEqual(bytesEqual(new Uint8Array([1, 2, 9]), new Uint8Array([1, 2, 3])), false);
  });
});
