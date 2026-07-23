import { z } from "zod";
import { DATE_TIME_PATTERN, isValidEetDateTime, UUID_PATTERN } from "../core/patterns.ts";
import type { Uuid } from "../types/header.ts";
import type { EetDateTime } from "../types/receipt.ts";
import { patternBrandSchema } from "./schema-helpers.ts";

const uuidSchema = patternBrandSchema<Uuid>(UUID_PATTERN, "UUIDType (RFC 9562)");
const eetDateTimeSchema = patternBrandSchema<EetDateTime>(
  DATE_TIME_PATTERN,
  "dateTime with an explicit offset (^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(Z|[+-]\\d\\d:\\d\\d)$)",
).refine(
  isValidEetDateTime,
  "is a syntactically valid dateTime but not a real calendar date/time (invalid month, day, hour, minute, second, or UTC offset).",
);

/**
 * zod v4 alternative to {@link parseHeader} (`builtin/validate.ts`): the same `<Hlavicka>`
 * validation rules, for callers who prefer zod over this SDK's hand-rolled validator, or want to
 * compose it into a larger application-level schema. Call `.decode()`/`.safeDecode()` yourself —
 * this module has no opinion on how you turn a failure into your own error type. Prefer
 * `.safeDecode()` over `.safeParse()`: it types its argument as `core.input<this>` (this
 * schema's raw shape) instead of `unknown`, so a wrong shape/type is a compile error, not just a
 * runtime one.
 */
export const EetHeaderZodSchema = z.object({
  uuid: uuidSchema,
  sentAt: eetDateTimeSchema,
  firstSubmission: z.boolean(),
  verification: z.boolean(),
});
