import type { Brand, Raw } from "../core/brand.ts";

/** A taxpayer/authorizing-taxpayer EIC (`CZEICType`, `^CZ[0-9]{8,10}$`). */
export type TaxPayerId = Brand<string, "TaxPayerId">;
/** A business premises identifier (`IdEvidJednotkyType`, `^[1-9][0-9]{0,8}$`, 1-999999999). */
export type RegisteringUnitIdentifier = Brand<string, "RegisteringUnitIdentifier">;
/** `string20`: `^[0-9a-zA-Z.,:;/#\-_ ]{1,20}$`. */
export type String20 = Brand<string, "String20">;
/** `string25`: `^[0-9a-zA-Z.,:;/#\-_ ]{1,25}$`. */
export type String25 = Brand<string, "String25">;
/** An ISO 8601 date/time with an explicit UTC offset (`dateTime` in the XSD). */
export type EetDateTime = Brand<string, "EetDateTime">;
/** A normalized decimal amount, exactly two decimal places (`CastkaType`). */
export type Amount = Brand<string, "Amount">;

/**
 * Business data of one recorded receipt (`<Data>` element), as accepted by
 * {@link EetReceiptData}. Property names follow the XML attribute names used by the
 * EET 2.0 XSD (`eic_popl`, `id_pokl`, ...) so they can be cross-referenced directly against
 * the specification. Optional properties must be omitted entirely, not set to `undefined`,
 * so that the SDK never emits an empty attribute.
 *
 * Every field is a branded type, proof that it already passed {@link parseEetReceiptData} —
 * obtain one from a plain, unbranded {@link EetReceiptDataInput} via that function, never by
 * constructing this interface directly.
 *
 * Financial values are normalized decimal strings (not `number`) with exactly two decimal
 * places, matching `CastkaType` in the XSD, so that precision and formatting survive
 * round-tripping through JavaScript. Date/time values are ISO 8601 strings with an explicit
 * UTC offset; the SDK never converts time zones or infers a local one.
 */
export interface EetReceiptData {
  /** Taxpayer's EIC (`^CZ[0-9]{8,10}$`). */
  readonly eic_popl: TaxPayerId;
  /** EIC of the authorizing taxpayer (`^CZ[0-9]{8,10}$`), if provided. */
  readonly eic_poverujiciho?: TaxPayerId;
  /** Authorization by multiple taxpayers. */
  readonly povereni_vice_popl?: boolean;
  /** Business premises identifier (`^[1-9][0-9]{0,8}$`, 1-999999999). */
  readonly id_jednotky: RegisteringUnitIdentifier;
  /** Taxpayer's cash register identifier (`^[0-9a-zA-Z.,:;/#\-_ ]{1,20}$`). */
  readonly id_pokl: String20;
  /** Receipt serial number (`^[0-9a-zA-Z.,:;/#\-_ ]{1,25}$`). */
  readonly porad_cis: String25;
  /** Date and time the sale took place, ISO 8601 with an explicit offset. */
  readonly dat_trzby: EetDateTime;
  /** Total sale amount, two decimal places (`CastkaType`). */
  readonly celk_trzba: Amount;
  /** Total amount of payments designated for subsequent drawdown or settlement. */
  readonly urceno_cerp_zuct?: Amount;
  /** Total amount of payments that are a subsequent drawdown or settlement of a payment. */
  readonly cerp_zuct?: Amount;
}

/** The raw, unbranded shape of {@link EetReceiptData} — what callers of `submit()` construct. */
export type EetReceiptDataInput = Raw<EetReceiptData>;
