import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { each } from "../../test/helpers.ts";
import type { EetReceiptDataInput } from "../types/receipt.ts";
import { EetReceiptDataZodSchema } from "./receipt.ts";

function validReceipt(overrides: Partial<EetReceiptDataInput> = {}): EetReceiptDataInput {
  return {
    eic_popl: "CZ8551015704",
    id_jednotky: "181",
    id_pokl: "00/2535/CN58",
    porad_cis: "0/2482/IE25",
    dat_trzby: "2027-01-07T22:01:00+01:00",
    celk_trzba: "87988.00",
    ...overrides,
  };
}

/** `true` if `input` fails `EetReceiptDataZodSchema`. */
function rejects(input: EetReceiptDataInput): boolean {
  return !EetReceiptDataZodSchema.safeDecode(input).success;
}

describe("EetReceiptDataZodSchema: eic_popl (CZEICType)", () => {
  each([["CZ00000019"], ["CZ683555118"], ["CZ8551015704"]])("accepts %s", (value) => {
    assert.strictEqual(rejects(validReceipt({ eic_popl: value })), false);
  });

  each([
    ["CZ1234567", "too few digits (7)"],
    ["cz00000019", "lowercase country code"],
    ["SK00000019", "wrong country code"],
  ])("rejects %s (%s)", (value) => {
    assert.strictEqual(rejects(validReceipt({ eic_popl: value })), true);
  });

  test("eic_poverujiciho is validated only when present, and omitted when absent", () => {
    const result = EetReceiptDataZodSchema.safeDecode(validReceipt());
    assert.strictEqual(result.success, true);
    if (!result.success) throw new Error("unreachable");
    assert.strictEqual("eic_poverujiciho" in result.data, false);

    assert.strictEqual(rejects(validReceipt({ eic_poverujiciho: "CZ00000019" })), false);
    assert.strictEqual(rejects(validReceipt({ eic_poverujiciho: "invalid" })), true);
  });
});

describe("EetReceiptDataZodSchema: id_jednotky (IdEvidJednotkyType)", () => {
  each([["1"], ["24"], ["999999999"]])("accepts %s", (value) => {
    assert.strictEqual(rejects(validReceipt({ id_jednotky: value })), false);
  });

  each([
    ["0", "zero not allowed"],
    ["01", "leading zero"],
    ["1000000000", "10 digits, out of range"],
  ])("rejects %s (%s)", (value) => {
    assert.strictEqual(rejects(validReceipt({ id_jednotky: value })), true);
  });
});

describe("EetReceiptDataZodSchema: id_pokl / porad_cis (string20 / string25)", () => {
  test("accepts the allowed character class and rejects characters outside it", () => {
    assert.strictEqual(rejects(validReceipt({ id_pokl: "5a/A-q/5:22d_2" })), false);
    assert.strictEqual(rejects(validReceipt({ id_pokl: "café" })), true);
  });

  test("accepts exactly at the length boundary and rejects one over", () => {
    assert.strictEqual(rejects(validReceipt({ porad_cis: "a".repeat(25) })), false);
    assert.strictEqual(rejects(validReceipt({ porad_cis: "a".repeat(26) })), true);
  });
});

describe("EetReceiptDataZodSchema: dat_trzby (dateTime, offset mandatory)", () => {
  each([["2027-01-08T21:19:40+01:00"], ["2027-01-08T21:19:40Z"]])("accepts %s", (value) => {
    assert.strictEqual(rejects(validReceipt({ dat_trzby: value })), false);
  });

  each([
    ["2027-01-08T21:19:40", "missing offset"],
    ["2024-02-30T25:61:61+99:00", "shape matches but nothing is a real value"],
    ["2027-02-30T12:00:00Z", "February 30th does not exist"],
  ])("rejects %s (%s)", (value) => {
    assert.strictEqual(rejects(validReceipt({ dat_trzby: value })), true);
  });
});

describe("EetReceiptDataZodSchema: celk_trzba (CastkaType)", () => {
  each([["250.00"], ["-187.20"], ["0.00"], ["99999999.99"]])("accepts %s", (value) => {
    assert.strictEqual(rejects(validReceipt({ celk_trzba: value })), false);
  });

  each([
    ["020.45", "leading zero"],
    ["100", "missing decimal places"],
    ["100000000.00", "absolute value not < 100000000"],
  ])("rejects %s (%s)", (value) => {
    assert.strictEqual(rejects(validReceipt({ celk_trzba: value })), true);
  });

  test("urceno_cerp_zuct / cerp_zuct are validated only when present", () => {
    assert.strictEqual(rejects(validReceipt()), false);
    assert.strictEqual(
      rejects(validReceipt({ urceno_cerp_zuct: "343.00", cerp_zuct: "237.00" })),
      false,
    );
    assert.strictEqual(rejects(validReceipt({ urceno_cerp_zuct: "bad" })), true);
  });
});

describe("EetReceiptDataZodSchema", () => {
  test("brands every field on success", () => {
    const result = EetReceiptDataZodSchema.safeDecode(validReceipt());
    assert.strictEqual(result.success, true);
    if (!result.success) throw new Error("unreachable");
    assert.strictEqual(String(result.data.eic_popl), "CZ8551015704");
  });

  test("collects every issue, not just the first", () => {
    const result = EetReceiptDataZodSchema.safeDecode(
      validReceipt({ eic_popl: "invalid", id_jednotky: "invalid" }),
    );
    assert.strictEqual(result.success, false);
    if (result.success) throw new Error("unreachable");
    assert.ok(result.error.issues.length >= 2);
  });
});
