/**
 * Small building blocks shared by the zod v4 schemas in this directory. Mirrors the primitives
 * in `builtin/struct-validator.ts` (`patternBrand`) so both validators enforce identical rules and
 * produce identical branded output types — see `core/brand.ts` for why any validator producing
 * the same `Raw<T>` -> `T` shape is interchangeable with `submit()`.
 */
import { z } from "zod";
import { isAllowedAsciiString } from "../core/patterns.ts";

/**
 * Builds a zod schema for a branded string that must match `pattern` and the SDK's ASCII rule
 * (spec 3.1), then brands it as `Out` via `.transform`.
 */
export function patternBrandSchema<Out extends string>(
  pattern: RegExp,
  patternDescription: string,
) {
  return z
    .string()
    .refine(
      isAllowedAsciiString,
      "contains a character outside the allowed ASCII set (codes 9, 10, 13, 32-126).",
    )
    .refine((value) => pattern.test(value), `does not match the format ${patternDescription}.`)
    .transform((value) => value as Out);
}
