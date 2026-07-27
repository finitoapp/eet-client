import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { at, bytesEqual, concatBytes, constantTimeEqual } from "./bytes.ts";

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

describe("constantTimeEqual", () => {
  test("returns true for two empty arrays", () => {
    assert.strictEqual(constantTimeEqual(new Uint8Array([]), new Uint8Array([])), true);
  });

  test("returns true for identical byte sequences", () => {
    assert.strictEqual(
      constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])),
      true,
    );
  });

  test("returns false for different lengths", () => {
    assert.strictEqual(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])), false);
  });

  test("returns false when a single byte differs at the start", () => {
    assert.strictEqual(
      constantTimeEqual(new Uint8Array([9, 2, 3]), new Uint8Array([1, 2, 3])),
      false,
    );
  });

  test("returns false when a single byte differs at the end", () => {
    assert.strictEqual(
      constantTimeEqual(new Uint8Array([1, 2, 9]), new Uint8Array([1, 2, 3])),
      false,
    );
  });

  test("returns false when every byte differs", () => {
    assert.strictEqual(
      constantTimeEqual(new Uint8Array([9, 9, 9]), new Uint8Array([1, 2, 3])),
      false,
    );
  });
});

describe("at", () => {
  test("returns the element at a valid index", () => {
    assert.strictEqual(at(new Uint8Array([10, 20, 30]), 1), 20);
  });

  test("throws for an out-of-range index", () => {
    assert.throws(() => at(new Uint8Array([10, 20, 30]), 3), /out of bounds/);
  });

  test("works generically over non-Uint8Array array-likes", () => {
    assert.strictEqual(at(["a", "b", "c"], 2), "c");
  });
});

describe("concatBytes", () => {
  test("returns an empty array when called with no arguments", () => {
    assert.deepStrictEqual(concatBytes(), new Uint8Array([]));
  });

  test("returns a copy of a single array", () => {
    const input = new Uint8Array([1, 2, 3]);
    const result = concatBytes(input);
    assert.deepStrictEqual(result, input);
    assert.notStrictEqual(result, input);
  });

  test("concatenates multiple arrays in order", () => {
    assert.deepStrictEqual(
      concatBytes(
        new Uint8Array([1, 2]),
        new Uint8Array([]),
        new Uint8Array([3]),
        new Uint8Array([4, 5]),
      ),
      new Uint8Array([1, 2, 3, 4, 5]),
    );
  });
});
