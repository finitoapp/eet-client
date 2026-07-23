/**
 * Nominal ("branded") string types. Pure type-level utilities, no runtime code and no
 * dependency on any particular validator — any validator that produces a value structurally
 * matching `T`'s raw shape can brand it (e.g. via `as`) into the same nominal type, whether it's
 * built by hand (see `builtin/struct-validator.ts`) or with a library like zod.
 */

/** Attaches a nominal tag `B` to `T`, so structurally identical types stay distinct. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

// Not `T extends Brand<infer U, string> ? U : T`: TS can't reliably infer U out of an
// intersection type, so it silently fails to unwrap. Every brand in this SDK wraps `string`,
// so testing for the tag structurally and hardcoding the underlying type works instead.
type Unbrand<T> = T extends { readonly __brand: string } ? string : T;

/** The raw, unbranded shape accepted as input to whatever produces branded struct `T`. */
export type Raw<T> = { [K in keyof T]: Unbrand<NonNullable<T[K]>> };
