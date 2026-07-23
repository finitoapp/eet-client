import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Brand, Raw } from "../core/brand.ts";
import { err, ok } from "../result.ts";
import {
  type FieldValidator,
  optional,
  patternBrand,
  type StructValidators,
  validateStruct,
} from "./struct-validator.ts";

// A toy branded struct, unrelated to the EET domain, so these tests exercise `validateStruct`
// and friends as the generic, reusable combinator they're meant to be.
type Slug = Brand<string, "Slug">;
type PositiveInt = Brand<string, "PositiveInt">;

interface Widget {
  readonly slug: Slug;
  readonly nickname?: Slug;
  readonly quantity: PositiveInt;
  readonly active: boolean;
  readonly note?: string;
}

const parseSlug = patternBrand<"Slug">(/^[a-z0-9-]+$/, "lowercase-kebab-slug");
const parsePositiveInt = patternBrand<"PositiveInt">(/^[1-9][0-9]*$/, "positive integer");
const parseActive: FieldValidator<boolean> = (raw) =>
  typeof raw === "boolean" ? ok(raw) : err("is required.");
const parseNote: FieldValidator<string> = (raw) =>
  typeof raw === "string" ? ok(raw) : err("is required.");

const widgetValidators: StructValidators<Widget> = {
  slug: parseSlug,
  nickname: optional(parseSlug),
  quantity: parsePositiveInt,
  active: parseActive,
  note: optional(parseNote),
};

function parseWidget(input: Raw<Widget>) {
  return validateStruct<Widget>(input, widgetValidators);
}

describe("validateStruct", () => {
  test("brands every field and returns Ok for fully valid input", () => {
    const result = parseWidget({
      slug: "acme-widget",
      quantity: "3",
      active: true,
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.strictEqual(String(result.value.slug), "acme-widget");
    assert.strictEqual(String(result.value.quantity), "3");
    assert.strictEqual(result.value.active, true);
  });

  test("carries an optional field through when present", () => {
    const result = parseWidget({
      slug: "acme-widget",
      nickname: "acme",
      quantity: "3",
      active: true,
      note: "handle with care",
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.strictEqual(String(result.value.nickname), "acme");
    assert.strictEqual(result.value.note, "handle with care");
  });

  test("omits absent optional fields from the output entirely, not as `undefined`", () => {
    const result = parseWidget({
      slug: "acme-widget",
      quantity: "3",
      active: true,
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.strictEqual("nickname" in result.value, false);
    assert.strictEqual("note" in result.value, false);
  });

  test("collects issues from every invalid field, not just the first", () => {
    const result = validateStruct<Widget>(
      { slug: "Not A Slug!", quantity: "0", active: true },
      widgetValidators,
    );
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.strictEqual(result.error.length, 2);
    assert.ok(result.error[0]?.includes("slug:"));
    assert.ok(result.error[1]?.includes("quantity:"));
  });

  test("reports a missing required field instead of silently dropping it", () => {
    const result = validateStruct<Widget>(
      { quantity: "3", active: true } as unknown as Raw<Widget>,
      widgetValidators,
    );
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.deepStrictEqual(result.error, ["slug: is required."]);
  });

  test("rejects a value of the wrong runtime type even when TS believes it's fine", () => {
    const result = validateStruct<Widget>(
      { slug: "acme-widget", quantity: "3", active: "yes" } as unknown as Raw<Widget>,
      widgetValidators,
    );
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.deepStrictEqual(result.error, ["active: is required."]);
  });
});

describe("optional", () => {
  test("passes undefined through as Ok(undefined) without calling the wrapped validator", () => {
    const result = optional(parseSlug)(undefined);
    assert.deepStrictEqual(result, { ok: true, value: undefined });
  });

  test("delegates to the wrapped validator for a present value", () => {
    assert.deepStrictEqual(optional(parseSlug)("valid-slug"), {
      ok: true,
      value: "valid-slug" as Slug,
    });
    assert.strictEqual(optional(parseSlug)("Not Valid").ok, false);
  });
});

describe("patternBrand", () => {
  const parse = patternBrand<"Slug">(/^[a-z0-9-]+$/, "lowercase-kebab-slug");

  test("brands a matching value", () => {
    const result = parse("acme-widget");
    assert.deepStrictEqual(result, { ok: true, value: "acme-widget" as Slug });
  });

  test("rejects a value that doesn't match the pattern", () => {
    const result = parse("Not A Slug!");
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.ok(result.error.includes("does not match the format"));
  });

  test("rejects a value outside the SDK's allowed ASCII range", () => {
    const result = parse("café-widget");
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.ok(result.error.includes("ASCII"));
  });

  test("rejects a non-string value instead of throwing", () => {
    const result = parse(undefined);
    assert.deepStrictEqual(result, { ok: false, error: "is required." });
  });

  test("escapes CR/LF/tab in a rejected value instead of echoing them raw", () => {
    // CR/LF/tab all pass the SDK's allowed-ASCII check (codes 9, 10, 13), so a value containing
    // them can still reach the "does not match the format" message below — echoing them
    // unescaped would let a caller who logs `error.message` verbatim have extra log lines forged
    // into their logs.
    const result = parse("abc\r\ndef\tghi");
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.ok(result.error.includes("abc\\r\\ndef\\tghi"));
    assert.ok(!result.error.includes("\r"));
    assert.ok(!result.error.includes("\n"));
    assert.ok(!result.error.includes("\t"));
  });

  test("truncates a very long rejected value instead of echoing it in full", () => {
    const longValue = "A".repeat(200); // uppercase: fails the lowercase-only slug pattern
    const result = parse(longValue);
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.ok(result.error.includes("..."));
    assert.ok(result.error.length < longValue.length);
  });
});
