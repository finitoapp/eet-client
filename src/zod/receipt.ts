import { z } from "zod";
import {
  CASTKA_PATTERN,
  CZ_EIC_PATTERN,
  DATE_TIME_PATTERN,
  ID_EVID_JEDNOTKY_PATTERN,
  isValidEetDateTime,
  STRING_20_PATTERN,
  STRING_25_PATTERN,
} from "../core/patterns.ts";
import type {
  Amount,
  EetDateTime,
  EetReceiptData,
  RegisteringUnitIdentifier,
  String20,
  String25,
  TaxPayerId,
} from "../types/receipt.ts";
import { patternBrandSchema } from "./schema-helpers.ts";

const taxPayerIdSchema = patternBrandSchema<TaxPayerId>(
  CZ_EIC_PATTERN,
  "CZEICType (^CZ[0-9]{8,10}$)",
);
const registeringUnitIdentifierSchema = patternBrandSchema<RegisteringUnitIdentifier>(
  ID_EVID_JEDNOTKY_PATTERN,
  "IdEvidJednotkyType (^[1-9][0-9]{0,8}$, 1-999999999)",
);
const string20Schema = patternBrandSchema<String20>(
  STRING_20_PATTERN,
  "string20 (^[0-9a-zA-Z.,:;/#-_ ]{1,20}$)",
);
const string25Schema = patternBrandSchema<String25>(
  STRING_25_PATTERN,
  "string25 (^[0-9a-zA-Z.,:;/#-_ ]{1,25}$)",
);
const eetDateTimeSchema = patternBrandSchema<EetDateTime>(
  DATE_TIME_PATTERN,
  "dateTime with an explicit offset (^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(Z|[+-]\\d\\d:\\d\\d)$)",
).refine(
  isValidEetDateTime,
  "is a syntactically valid dateTime but not a real calendar date/time (invalid month, day, hour, minute, second, or UTC offset).",
);
const amountSchema = patternBrandSchema<Amount>(
  CASTKA_PATTERN,
  "CastkaType (two decimal places, absolute value < 100000000)",
);

/**
 * zod v4 alternative to {@link parseEetReceiptData} (`builtin/validate.ts`): the same `<Data>`
 * validation rules, for callers who prefer zod over this SDK's hand-rolled validator, or want to
 * compose it into a larger application-level schema. Call `.decode()`/`.safeDecode()` yourself —
 * this module has no opinion on how you turn a failure into your own error type. Prefer
 * `.safeDecode()` over `.safeParse()`: it types its argument as `core.input<this>` (this
 * schema's raw shape) instead of `unknown`, so a wrong shape/type is a compile error, not just a
 * runtime one.
 */
export const EetReceiptDataZodSchema = z
  .object({
    eic_popl: taxPayerIdSchema,
    eic_poverujiciho: taxPayerIdSchema.optional(),
    povereni_vice_popl: z.boolean().optional(),
    id_jednotky: registeringUnitIdentifierSchema,
    id_pokl: string20Schema,
    porad_cis: string25Schema,
    dat_trzby: eetDateTimeSchema,
    celk_trzba: amountSchema,
    urceno_cerp_zuct: amountSchema.optional(),
    cerp_zuct: amountSchema.optional(),
  })
  .transform(
    (parsed): EetReceiptData => ({
      eic_popl: parsed.eic_popl,
      ...(parsed.eic_poverujiciho !== undefined
        ? { eic_poverujiciho: parsed.eic_poverujiciho }
        : {}),
      ...(parsed.povereni_vice_popl !== undefined
        ? { povereni_vice_popl: parsed.povereni_vice_popl }
        : {}),
      id_jednotky: parsed.id_jednotky,
      id_pokl: parsed.id_pokl,
      porad_cis: parsed.porad_cis,
      dat_trzby: parsed.dat_trzby,
      celk_trzba: parsed.celk_trzba,
      ...(parsed.urceno_cerp_zuct !== undefined
        ? { urceno_cerp_zuct: parsed.urceno_cerp_zuct }
        : {}),
      ...(parsed.cerp_zuct !== undefined ? { cerp_zuct: parsed.cerp_zuct } : {}),
    }),
  );
