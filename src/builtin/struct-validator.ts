/**
 * This SDK's hand-rolled runtime validator: a generic, reusable engine for turning a raw,
 * unbranded struct into its branded counterpart, collecting every field-level issue instead of
 * stopping at the first one. It's one possible way to produce the branded types from
 * `core/brand.ts` — an alternative validator (e.g. built on zod) would not use this module at
 * all, it would just need to produce the same branded output types.
 */

import type { Brand, Raw } from "../core/brand.ts";
import { isAllowedAsciiString } from "../core/patterns.ts";
import { err, ok, type Result } from "../result.ts";

/** Validates/brands one raw field value, or reports why it's invalid. */
export type FieldValidator<T> = (raw: unknown) => Result<T, string>;

/** A validator for every field of `T`, including optional ones. */
export type StructValidators<T> = { [K in keyof T]-?: FieldValidator<T[K]> };

/**
 * Turns a required field validator into one that also accepts an absent (`undefined`) value,
 * passing it through as `undefined` instead of running the wrapped validator.
 */
export function optional<T>(validator: FieldValidator<T>): FieldValidator<T | undefined> {
  return (raw) => (raw === undefined ? ok(undefined) : validator(raw));
}

/**
 * Layers an additional semantic check on top of a validator that already succeeded
 * structurally — for constraints a pattern alone can't express, e.g. that a `dateTime`-shaped
 * string also names a real calendar date/time.
 */
export function refine<T>(
  validator: FieldValidator<T>,
  predicate: (value: T) => boolean,
  message: string,
): FieldValidator<T> {
  return (raw) => {
    const result = validator(raw);
    if (!result.ok) return result;
    return predicate(result.value) ? result : err(message);
  };
}

/**
 * Validates every field of `input` against `validators`, collecting every issue instead of
 * stopping at the first one. Fields the corresponding validator resolves to `undefined` (i.e.
 * absent optional fields) are omitted from the result entirely, never set to `undefined`
 * explicitly, so branded structs stay compatible with `exactOptionalPropertyTypes`.
 */
export function validateStruct<T extends object>(
  input: Raw<T>,
  validators: StructValidators<T>,
): Result<T, readonly string[]> {
  const issues: string[] = [];
  const output: Record<string, unknown> = {};

  // Casts below are unavoidable: TS can't correlate a dynamic `keyof T` loop with the specific
  // per-field generic type each validator/value actually has.
  for (const key of Object.keys(validators) as (keyof T)[]) {
    const validate = validators[key];
    const result = validate((input as Record<string, unknown>)[key as string]);
    if (!result.ok) {
      issues.push(`${String(key)}: ${result.error}`);
    } else if (result.value !== undefined) {
      output[key as string] = result.value;
    }
  }

  return issues.length > 0 ? err(issues) : ok(output as T);
}

const MAX_ECHOED_VALUE_LENGTH = 100;

/**
 * Escapes tab/CR/LF (all allowed by the SDK's ASCII rule, spec 3.1) and truncates before echoing
 * a rejected value back in an error message — otherwise a value containing a literal CR/LF could
 * forge extra log lines wherever a caller logs `error.message` verbatim.
 */
function describeRejectedValue(raw: string): string {
  const escaped = raw.replace(
    /[\t\r\n]/g,
    (ch) => ({ "\t": "\\t", "\r": "\\r", "\n": "\\n" })[ch as "\t" | "\r" | "\n"],
  );
  return escaped.length > MAX_ECHOED_VALUE_LENGTH
    ? `${escaped.slice(0, MAX_ECHOED_VALUE_LENGTH)}...`
    : escaped;
}

/** Builds a validator for a branded string that must match `pattern` and the SDK's ASCII rule (spec 3.1). */
export function patternBrand<B extends string>(
  pattern: RegExp,
  patternDescription: string,
): FieldValidator<Brand<string, B>> {
  return (raw) => {
    if (typeof raw !== "string") return err("is required.");
    if (!isAllowedAsciiString(raw)) {
      return err("contains a character outside the allowed ASCII set (codes 9, 10, 13, 32-126).");
    }
    if (!pattern.test(raw)) {
      return err(
        `value "${describeRejectedValue(raw)}" does not match the format ${patternDescription}.`,
      );
    }
    return ok(raw as Brand<string, B>);
  };
}
