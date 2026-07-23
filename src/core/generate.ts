/**
 * Trusted generators for `<Hlavicka>` fields the SDK can synthesize itself: the counterpart to
 * `builtin/struct-validator.ts`. A validator brands untrusted input after checking it; these functions
 * produce values that are correct by construction, so they brand directly, no check needed.
 */
import type { Uuid } from "../types/header.ts";
import type { EetDateTime } from "../types/receipt.ts";

/** Generates a fresh `uuid_zpravy` via the runtime Web Crypto API. */
export function generateUuid(): Uuid {
  return crypto.randomUUID() as Uuid;
}

/**
 * Generates the current time as `dat_odesl`/`dat_trzby`: ISO 8601 with an explicit UTC offset
 * (`Z`), no fractional seconds, matching the EET dateTime pattern exactly.
 */
export function generateEetDateTime(): EetDateTime {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z") as EetDateTime;
}
