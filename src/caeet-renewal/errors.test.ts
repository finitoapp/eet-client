import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCaeetHttpError, createCaeetValidationError, isCaeetError } from "./errors.ts";

describe("isCaeetError", () => {
  test("narrows a matching error type", () => {
    const error = createCaeetValidationError({ message: "invalid" });
    assert.strictEqual(isCaeetError(error, "CaeetValidationError"), true);
  });

  test("returns false for a differently-typed CaeetError", () => {
    const error = createCaeetHttpError({ message: "bad status" });
    assert.strictEqual(isCaeetError(error, "CaeetValidationError"), false);
  });

  test("returns false for an arbitrary unknown value", () => {
    assert.strictEqual(isCaeetError(new Error("plain"), "CaeetValidationError"), false);
    assert.strictEqual(isCaeetError(null, "CaeetValidationError"), false);
  });
});
