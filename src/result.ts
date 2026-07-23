/**
 * Minimal `Result<T, E>` type for recoverable, typed error handling without `throw`/`catch`.
 * Adapted from Evolu's `Result` (https://github.com/evoluhq/evolu), trimmed to what this SDK
 * needs: no `Done`/`NextResult` pull-protocol support, no `allResult`/`mapResult`/`anyResult`
 * collection combinators. Prefer plain imperative code (`if (!result.ok) return result;`) to
 * compose results — see call sites in `core/parse-response.ts` and `client.ts`.
 */

/** A successful {@link Result}. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed {@link Result}. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Either {@link Ok} (success with a value) or {@link Err} (failure with a typed error). */
export type Result<T, E = never> = Ok<T> | Err<E>;

/** Creates an {@link Ok} result. `ok()` is shorthand for `ok(undefined)`. */
export function ok(): Result<void>;
export function ok<T>(value: T): Result<T>;
export function ok<T>(value?: T): Result<T> {
  return { ok: true, value: value as T };
}

/** Creates an {@link Err} result. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Type guard for {@link Ok} results. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard for {@link Err} results. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Returns the value of an `Ok` result, or throws if it is an `Err`.
 *
 * Use only where failure should crash the current flow instead of being handled locally (e.g.
 * test setup, module-level constants) — not in ordinary SDK logic, which should check
 * `result.ok` explicitly.
 */
export function getOrThrow<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error("getOrThrow", { cause: result.error });
}

/** Returns the value of an `Ok` result, or `null` if it is an `Err`. */
export function getOrNull<T, E>(result: Result<T, E>): T | null {
  return result.ok ? result.value : null;
}

/**
 * Wraps a synchronous function that may throw, converting the thrown value into a typed `Err`
 * via `mapError`.
 */
export function trySync<T, E>(fn: () => T, mapError: (error: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    return err(mapError(error));
  }
}

/**
 * Wraps an async function that may throw/reject, converting the rejection into a typed `Err`
 * via `mapError`.
 */
export async function tryAsync<T, E>(
  fn: () => PromiseLike<T>,
  mapError: (error: unknown) => E,
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(mapError(error));
  }
}
