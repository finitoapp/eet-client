import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { each } from "../../test/helpers.ts";
import type { EetHeaderInput } from "../types/header.ts";
import { EetHeaderZodSchema } from "./header.ts";

function validHeader(overrides: Partial<EetHeaderInput> = {}): EetHeaderInput {
  return {
    uuid: "e23e5a5a-08d7-4a08-844d-2b6c6b60621d",
    sentAt: "2027-01-08T21:19:40+01:00",
    firstSubmission: true,
    verification: false,
    ...overrides,
  };
}

/** `true` if `input` fails `EetHeaderZodSchema`. */
function rejects(input: EetHeaderInput): boolean {
  return !EetHeaderZodSchema.safeDecode(input).success;
}

describe("EetHeaderZodSchema: uuid (UUIDType)", () => {
  each([["b3a09b52-7c87-4014-a496-4c7a53cf9125"], ["123e4567-e89b-42d3-a456-426655440000"]])(
    "accepts %s",
    (uuid) => {
      assert.strictEqual(rejects(validHeader({ uuid })), false);
    },
  );

  each([
    ["b3a09b52-7c87-6014-a496-4c7a53cf9125", "version nibble out of 1-5 range"],
    ["not-a-uuid", "garbage"],
  ])("rejects %s (%s)", (uuid) => {
    assert.strictEqual(rejects(validHeader({ uuid })), true);
  });
});

describe("EetHeaderZodSchema: sentAt (dateTime, offset mandatory)", () => {
  each([["2027-01-08T21:19:40+01:00"], ["2027-01-08T21:19:40Z"]])("accepts %s", (value) => {
    assert.strictEqual(rejects(validHeader({ sentAt: value })), false);
  });

  each([
    ["2027-01-08T21:19:40", "missing offset"],
    ["2027-02-30T12:00:00Z", "February 30th does not exist"],
  ])("rejects %s (%s)", (value) => {
    assert.strictEqual(rejects(validHeader({ sentAt: value })), true);
  });
});

describe("EetHeaderZodSchema", () => {
  test("brands every field on success", () => {
    const result = EetHeaderZodSchema.safeDecode(validHeader());
    assert.strictEqual(result.success, true);
    if (!result.success) throw new Error("unreachable");
    assert.strictEqual(String(result.data.uuid), "e23e5a5a-08d7-4a08-844d-2b6c6b60621d");
  });

  test("collects every issue, not just the first", () => {
    const result = EetHeaderZodSchema.safeDecode(
      validHeader({ uuid: "not-a-uuid", sentAt: "not-a-date" }),
    );
    assert.strictEqual(result.success, false);
    if (result.success) throw new Error("unreachable");
    assert.ok(result.error.issues.length >= 2);
  });
});
