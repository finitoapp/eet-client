import {
  CASTKA_PATTERN,
  CZ_EIC_PATTERN,
  DATE_TIME_PATTERN,
  ID_EVID_JEDNOTKY_PATTERN,
  isValidEetDateTime,
  STRING_20_PATTERN,
  STRING_25_PATTERN,
  UUID_PATTERN,
} from "../core/patterns.ts";
import { err, ok, type Result } from "../result.ts";
import { createEetValidationError, type EetValidationError } from "../types/errors.ts";
import type { EetHeader, EetHeaderInput } from "../types/header.ts";
import type { EetReceiptData, EetReceiptDataInput } from "../types/receipt.ts";
import {
  type FieldValidator,
  optional,
  patternBrand,
  refine,
  type StructValidators,
  validateStruct,
} from "./struct-validator.ts";

const parseTaxPayerId = patternBrand<"TaxPayerId">(CZ_EIC_PATTERN, "CZEICType (^CZ[0-9]{8,10}$)");
const parseRegisteringUnitIdentifier = patternBrand<"RegisteringUnitIdentifier">(
  ID_EVID_JEDNOTKY_PATTERN,
  "IdEvidJednotkyType (^[1-9][0-9]{0,8}$, 1-999999999)",
);
const parseString20 = patternBrand<"String20">(
  STRING_20_PATTERN,
  "string20 (^[0-9a-zA-Z.,:;/#-_ ]{1,20}$)",
);
const parseString25 = patternBrand<"String25">(
  STRING_25_PATTERN,
  "string25 (^[0-9a-zA-Z.,:;/#-_ ]{1,25}$)",
);
const parseEetDateTime = refine(
  patternBrand<"EetDateTime">(
    DATE_TIME_PATTERN,
    "dateTime with an explicit offset (^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(Z|[+-]\\d\\d:\\d\\d)$)",
  ),
  isValidEetDateTime,
  "is a syntactically valid dateTime but not a real calendar date/time (invalid month, day, hour, minute, second, or UTC offset).",
);
const parseAmount = patternBrand<"Amount">(
  CASTKA_PATTERN,
  "CastkaType (two decimal places, absolute value < 100000000)",
);
const parseUuid = patternBrand<"Uuid">(UUID_PATTERN, "UUIDType (RFC 9562)");

const parseBoolean: FieldValidator<boolean> = (raw) =>
  typeof raw === "boolean" ? ok(raw) : err("is required.");

const receiptValidators: StructValidators<EetReceiptData> = {
  eic_popl: parseTaxPayerId,
  eic_poverujiciho: optional(parseTaxPayerId),
  povereni_vice_popl: optional(parseBoolean),
  id_jednotky: parseRegisteringUnitIdentifier,
  id_pokl: parseString20,
  porad_cis: parseString25,
  dat_trzby: parseEetDateTime,
  celk_trzba: parseAmount,
  urceno_cerp_zuct: optional(parseAmount),
  cerp_zuct: optional(parseAmount),
};

const headerValidators: StructValidators<EetHeader> = {
  uuid: parseUuid,
  sentAt: parseEetDateTime,
  firstSubmission: parseBoolean,
  verification: parseBoolean,
};

function toValidationError(issues: readonly string[]): EetValidationError {
  return createEetValidationError({
    message: `Invalid receipt data (${issues.length} issue(s)).`,
    issues,
  });
}

/** Validates the `<Data>` portion of a receipt, branding every field on success. */
export function parseEetReceiptData(
  input: EetReceiptDataInput,
): Result<EetReceiptData, EetValidationError> {
  const result = validateStruct<EetReceiptData>(input, receiptValidators);
  return result.ok ? result : err(toValidationError(result.error));
}

/** Validates the resolved `<Hlavicka>` values, branding every field on success. */
export function parseHeader(input: EetHeaderInput): Result<EetHeader, EetValidationError> {
  const result = validateStruct<EetHeader>(input, headerValidators);
  return result.ok ? result : err(toValidationError(result.error));
}
