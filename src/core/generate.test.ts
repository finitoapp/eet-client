import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generateEetDateTime, generateUuid } from "./generate.ts";
import { DATE_TIME_PATTERN, UUID_PATTERN } from "./patterns.ts";

describe("generateUuid", () => {
  test("produces a value matching UUIDType (RFC 9562)", () => {
    assert.strictEqual(UUID_PATTERN.test(generateUuid()), true);
  });

  test("produces a fresh value on every call", () => {
    assert.notStrictEqual(generateUuid(), generateUuid());
  });
});

describe("generateEetDateTime", () => {
  test("produces a value matching the EET dateTime pattern", () => {
    assert.strictEqual(DATE_TIME_PATTERN.test(generateEetDateTime()), true);
  });

  test("has no fractional seconds and an explicit Z offset", () => {
    assert.match(generateEetDateTime(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
