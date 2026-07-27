import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  each,
  REFERENCE_SAMPLE_EICS,
  readReferenceTrzbaMessage,
  referenceHeaderInput,
  referenceReceiptDataInput,
} from "../../test/helpers.ts";
import { isAllowedAsciiString } from "../core/patterns.ts";
import type { EetHeaderInput } from "../types/header.ts";
import type { EetReceiptDataInput } from "../types/receipt.ts";
import { parseEetReceiptData, parseHeader } from "./validate.ts";

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

function validHeader(overrides: Partial<EetHeaderInput> = {}): EetHeaderInput {
  return {
    uuid: "e23e5a5a-08d7-4a08-844d-2b6c6b60621d",
    sentAt: "2027-01-08T21:19:40+01:00",
    firstSubmission: true,
    verification: false,
    ...overrides,
  };
}

/** Issues from `parseEetReceiptData`, or `[]` if the input is valid — mirrors the old array-returning API for terse table-driven tests. */
function receiptIssues(input: EetReceiptDataInput): readonly string[] {
  const result = parseEetReceiptData(input);
  return result.ok ? [] : result.error.issues;
}

function headerIssues(input: EetHeaderInput): readonly string[] {
  const result = parseHeader(input);
  return result.ok ? [] : result.error.issues;
}

describe("isAllowedAsciiString", () => {
  test("accepts tab, LF, CR, and printable ASCII 32-126", () => {
    assert.strictEqual(isAllowedAsciiString("\t\n\r Hello, World! 0-9 #_/:;.,-"), true);
  });

  test("rejects control characters outside 9/10/13", () => {
    assert.strictEqual(isAllowedAsciiString("\x00"), false); // NUL
    assert.strictEqual(isAllowedAsciiString("\x01"), false); // SOH
    assert.strictEqual(isAllowedAsciiString("a\x7fb"), false); // DEL (127)
  });

  test("rejects non-ASCII / diacritics", () => {
    assert.strictEqual(isAllowedAsciiString("Příliš žluťoučký kůň"), false);
  });
});

describe("parseEetReceiptData: eic_popl / eic_poverujiciho (CZEICType)", () => {
  each([["CZ00000019"], ["CZ683555118"], ["CZ8551015704"]])("accepts %s", (value) => {
    assert.deepStrictEqual(receiptIssues(validReceipt({ eic_popl: value })), []);
  });

  each([
    ["CZ1234567", "too few digits (7)"],
    ["CZ12345678901", "too many digits (11)"],
    ["cz00000019", "lowercase country code"],
    ["SK00000019", "wrong country code"],
    ["CZ0000001A", "non-digit"],
  ])("rejects %s (%s)", (value) => {
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ eic_popl: value })), []);
  });

  test("eic_poverujiciho is validated only when present, and omitted when absent", () => {
    const result = parseEetReceiptData(validReceipt());
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.strictEqual("eic_poverujiciho" in result.value, false);

    assert.deepStrictEqual(receiptIssues(validReceipt({ eic_poverujiciho: "CZ00000019" })), []);
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ eic_poverujiciho: "invalid" })), []);
  });
});

describe("parseEetReceiptData: id_jednotky (IdEvidJednotkyType)", () => {
  each([["1"], ["24"], ["164968741"], ["999999999"]])("accepts %s", (value) => {
    assert.deepStrictEqual(receiptIssues(validReceipt({ id_jednotky: value })), []);
  });

  each([
    ["0", "zero not allowed"],
    ["01", "leading zero"],
    ["1000000000", "10 digits, out of range"],
    ["-1", "negative"],
  ])("rejects %s (%s)", (value) => {
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ id_jednotky: value })), []);
  });
});

describe("parseEetReceiptData: id_pokl / porad_cis (string20 / string25)", () => {
  test("accepts the allowed character class including trailing space and hyphen", () => {
    assert.deepStrictEqual(receiptIssues(validReceipt({ id_pokl: "5a/A-q/5:22d_2" })), []);
    assert.deepStrictEqual(receiptIssues(validReceipt({ porad_cis: "#25/c-12/1A_2/2027" })), []);
  });

  test("accepts exactly at the length boundary and rejects one over", () => {
    assert.deepStrictEqual(receiptIssues(validReceipt({ id_pokl: "a".repeat(20) })), []);
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ id_pokl: "a".repeat(21) })), []);
    assert.deepStrictEqual(receiptIssues(validReceipt({ porad_cis: "a".repeat(25) })), []);
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ porad_cis: "a".repeat(26) })), []);
  });

  test("rejects the empty string", () => {
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ id_pokl: "" })), []);
  });

  test("rejects characters outside the allowed class", () => {
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ id_pokl: "café" })), []);
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ id_pokl: "a|b" })), []);
  });
});

describe("parseEetReceiptData / parseHeader: dateTime (offset mandatory)", () => {
  each([
    ["2027-01-08T21:19:40+01:00"],
    ["2027-06-09T05:25:28+02:00"],
    ["2027-01-08T21:19:40Z"],
    ["2027-01-08T21:19:40-05:00"],
  ])("accepts %s", (value) => {
    assert.deepStrictEqual(receiptIssues(validReceipt({ dat_trzby: value })), []);
    assert.deepStrictEqual(headerIssues(validHeader({ sentAt: value })), []);
  });

  each([
    ["2027-01-08T21:19:40", "missing offset"],
    ["2027-01-08 21:19:40Z", "space instead of T"],
    ["2027-01-08T21:19:40.123Z", "fractional seconds not allowed"],
    ["2027-01-08T21:19:40+1:00", "offset hours not zero-padded"],
    ["not-a-date", "garbage"],
    ["2024-02-30T25:61:61+99:00", "shape matches but nothing is a real value"],
    ["2027-02-30T12:00:00Z", "February 30th does not exist"],
    ["2023-02-29T12:00:00Z", "February 29th in a non-leap year"],
    ["2027-13-01T12:00:00Z", "month 13"],
    ["2027-01-01T24:00:00Z", "hour 24"],
    ["2027-01-01T12:00:00+14:01", "offset one minute past the +14:00 bound"],
  ])("rejects %s (%s)", (value) => {
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ dat_trzby: value })), []);
  });

  each([
    ["2024-02-29T12:00:00Z", "February 29th in a leap year"],
    ["2000-02-29T12:00:00Z", "February 29th in a century leap year (div 400)"],
    ["2027-01-01T12:00:00+14:00", "offset at the +14:00 bound"],
  ])("accepts %s (%s)", (value) => {
    assert.deepStrictEqual(receiptIssues(validReceipt({ dat_trzby: value })), []);
  });
});

describe("parseEetReceiptData: celk_trzba / urceno_cerp_zuct / cerp_zuct (CastkaType)", () => {
  each([["250.00"], ["-187.20"], ["0.56"], ["0.00"], ["99999999.99"], ["-99999999.99"]])(
    "accepts %s",
    (value) => {
      assert.deepStrictEqual(receiptIssues(validReceipt({ celk_trzba: value })), []);
    },
  );

  // Table straight from spec section 3.3.3.12.
  each([
    ["020.45", "leading zero"],
    ["00010.25", "leading zeros"],
    ["-0.00", "negative zero"],
    ["-00.00", "negative zero with leading zero"],
    [".20", "missing leading digit"],
    ["-00100.00", "leading zero on negative"],
    ["100", "missing decimal places"],
    ["100.5", "only one decimal place"],
    ["100.500", "three decimal places"],
    ["100000000.00", "absolute value not < 100000000"],
    ["-100000000.00", "absolute value not < 100000000"],
  ])("rejects %s (%s)", (value) => {
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ celk_trzba: value })), []);
  });

  test("urceno_cerp_zuct / cerp_zuct are validated only when present", () => {
    assert.deepStrictEqual(receiptIssues(validReceipt()), []);
    assert.deepStrictEqual(
      receiptIssues(validReceipt({ urceno_cerp_zuct: "343.00", cerp_zuct: "237.00" })),
      [],
    );
    assert.notDeepStrictEqual(receiptIssues(validReceipt({ urceno_cerp_zuct: "bad" })), []);
  });
});

describe("parseHeader: uuid_zpravy (UUIDType)", () => {
  each([["b3a09b52-7c87-4014-a496-4c7a53cf9125"], ["123e4567-e89b-42d3-a456-426655440000"]])(
    "accepts %s",
    (uuid) => {
      assert.deepStrictEqual(headerIssues(validHeader({ uuid })), []);
    },
  );

  each([
    ["b3a09b52-7c87-6014-a496-4c7a53cf9125", "version nibble out of 1-5 range"],
    ["b3a09b52-7c87-4014-c496-4c7a53cf9125", "variant nibble not 8/9/a/b"],
    ["not-a-uuid", "garbage"],
    ["b3a09b52-7c87-4014-a496-4c7a53cf912", "too short"],
  ])("rejects %s (%s)", (uuid) => {
    assert.notDeepStrictEqual(headerIssues(validHeader({ uuid })), []);
  });
});

describe("parseHeader: verification (required boolean, no XSD pattern)", () => {
  each([[true], [false]])("accepts %s", (verification) => {
    const result = parseHeader(validHeader({ verification }));
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.strictEqual(result.value.verification, verification);
  });

  test("reports an issue for a missing/non-boolean value", () => {
    assert.notDeepStrictEqual(
      headerIssues({ ...validHeader(), verification: undefined as unknown as boolean }),
      [],
    );
  });
});

describe("parseHeader", () => {
  test("brands every field on success", () => {
    const result = parseHeader(validHeader());
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.strictEqual(String(result.value.uuid), "e23e5a5a-08d7-4a08-844d-2b6c6b60621d");
  });

  test("returns Err(EetValidationError) collecting every issue, not just the first", () => {
    const result = parseHeader(validHeader({ uuid: "not-a-uuid", sentAt: "not-a-date" }));
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.strictEqual(result.error.type, "EetValidationError");
    assert.ok(result.error.issues.length >= 2);
  });
});

describe("parseEetReceiptData / parseHeader: genuine EET 2.0 playground reference messages", () => {
  // Independently-sourced conformance check: these `<Hlavicka>`/`<Data>` attribute values come
  // from real, signed requests GFŘ's own playground accepted (docs/reference/eet-2.0/*.eet.v4.req.xml),
  // not from test data authored alongside these validators — guards against a validator and its
  // own hand-written fixtures sharing the same (possibly wrong) assumption about what's valid.
  each(REFERENCE_SAMPLE_EICS.map((eic) => [eic] as const))(
    "%s: real captured values pass validation",
    (eic) => {
      const { hlavicka, data } = readReferenceTrzbaMessage(eic);
      assert.deepStrictEqual(receiptIssues(referenceReceiptDataInput(data, eic)), []);
      assert.deepStrictEqual(headerIssues(referenceHeaderInput(hlavicka, eic)), []);
    },
  );
});
