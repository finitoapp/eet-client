import type { Brand, Raw } from "../core/brand.ts";
import type { EetDateTime } from "./receipt.ts";

/** `uuid_zpravy` (`UUIDType`, RFC 9562). */
export type Uuid = Brand<string, "Uuid">;

/**
 * Fully resolved, validated `<Hlavicka>` values (after UUID/timestamp generation), proof that
 * they already passed a validator such as `parseHeader`.
 */
export interface EetHeader {
  readonly uuid: Uuid;
  readonly sentAt: EetDateTime;
  readonly firstSubmission: boolean;
  readonly verification: boolean;
}

/** The raw, unbranded shape of {@link EetHeader} — the input to a validator such as `parseHeader`. */
export type EetHeaderInput = Raw<EetHeader>;

/**
 * Options controlling the `<Hlavicka>` of the submitted `<Trzba>` message: {@link EetHeader}
 * with every field but `firstSubmission` made optional.
 *
 * - `firstSubmission` (`prvni_zaslani`): `true` for the first submission of this receipt,
 *   `false` for a retry. No safe default, so it's the one field that stays required.
 * - `verification` (`overeni`): defaults to `false` (production mode) when omitted.
 * - `uuid` (`uuid_zpravy`) and `sentAt` (`dat_odesl`) are generated securely from the runtime
 *   Web Crypto API when omitted; pass them explicitly — already validated/branded, e.g. via a
 *   validator's output — to retry a submission or to get deterministic output in tests.
 *
 * `submit()` trusts every field as-is; it performs no validation of its own.
 */
export type EetSubmitOptions = Partial<EetHeader> & Pick<EetHeader, "firstSubmission">;
