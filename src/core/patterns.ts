/**
 * Regular expressions and limits copied verbatim from `EETXMLSchema.xsd` (authoritative over
 * the prose specification, per task instructions) and from `EET_popis_rozhrani_v1.1.md`.
 */

/** `string20`: `id_pokl`. */
export const STRING_20_PATTERN = /^[0-9a-zA-Z.,:;/#\-_ ]{1,20}$/;

/** `string25`: `porad_cis`. */
export const STRING_25_PATTERN = /^[0-9a-zA-Z.,:;/#\-_ ]{1,25}$/;

/** `dateTime`: `dat_odesl`, `dat_trzby`, `dat_prij`, `dat_odmit`. Requires an explicit offset. */
export const DATE_TIME_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$/;

/** `CastkaType`: `celk_trzba`, `urceno_cerp_zuct`, `cerp_zuct`. */
export const CASTKA_PATTERN = /^((0|-?[1-9]\d{0,7})\.\d\d|-0\.(0[1-9]|[1-9]\d))$/;

/** `IdEvidJednotkyType`: `id_jednotky`, range 1–999999999. */
export const ID_EVID_JEDNOTKY_PATTERN = /^[1-9][0-9]{0,8}$/;

/** `UUIDType`: `uuid_zpravy`. */
export const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

/** `CZEICType`: `eic_popl`, `eic_poverujiciho`. */
export const CZ_EIC_PATTERN = /^CZ[0-9]{8,10}$/;

/** `PokType`: `pok`. */
export const POK_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}-[0-9a-fA-F]{2}$/;

/** `KodChybaType`: `kod`, range -999–999. */
export const KOD_CHYBA_PATTERN = /^-?\d{1,3}$/;

/** `KodVarovType`: `kod_varov`, range 1–999. */
export const KOD_VAROV_PATTERN = /^[1-9]\d{0,2}$/;

/** Maximum number of `<Varovani>` elements allowed by the XSD (`maxOccurs="10"`). */
export const MAX_WARNINGS = 10;

/** Maximum length in bytes of the fully assembled, signed UTF-8 SOAP envelope. */
export const MAX_MESSAGE_BYTES = 12_000;

/** Maximum length in characters of `<Chyba>`/`<Varovani>` text content. */
export const MAX_MESSAGE_TEXT_LENGTH = 100;

/**
 * Every data item in every EET message is restricted to single-byte ASCII characters with
 * decimal codes 9 (tab), 10 (LF), 13 (CR), or 32–126 (spec section 3.1).
 */
export function isAllowedAsciiCodePoint(codePoint: number): boolean {
  return (
    codePoint === 9 || codePoint === 10 || codePoint === 13 || (codePoint >= 32 && codePoint <= 126)
  );
}

/** Returns `true` if every character of `value` is an allowed ASCII character (see 3.1). */
export function isAllowedAsciiString(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const codePoint = value.codePointAt(i);
    if (codePoint === undefined || !isAllowedAsciiCodePoint(codePoint)) return false;
  }
  return true;
}

const DATE_TIME_CAPTURE_PATTERN =
  /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:Z|([+-])(\d\d):(\d\d))$/;

/**
 * Checks that `value` is not just shaped like `DATE_TIME_PATTERN` but names an actual calendar
 * date/time with a UTC offset within the `xs:dateTime` bound (`-14:00` to `+14:00` inclusive,
 * only 00 minutes allowed at exactly ±14). The pattern alone accepts nonsense like
 * `"2024-02-30T25:61:61+99:00"`.
 */
export function isValidEetDateTime(value: string): boolean {
  const match = DATE_TIME_CAPTURE_PATTERN.exec(value);
  if (match === null) return false;
  const [
    ,
    yearStr,
    monthStr,
    dayStr,
    hourStr,
    minuteStr,
    secondStr,
    offsetSign,
    offsetHourStr,
    offsetMinuteStr,
  ] = match;
  if (
    yearStr === undefined ||
    monthStr === undefined ||
    dayStr === undefined ||
    hourStr === undefined ||
    minuteStr === undefined ||
    secondStr === undefined
  ) {
    return false;
  }

  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  // Round-trip through Date's own calendar arithmetic (leap years included) rather than
  // hand-rolling day-of-month tables: an out-of-range component rolls over into a neighboring
  // unit, so the components read back out won't match the ones written in.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  const isRealDateTime =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;
  if (!isRealDateTime) return false;

  if (offsetSign === undefined) return true; // "Z": no offset to check.
  if (offsetHourStr === undefined || offsetMinuteStr === undefined) return false;
  const offsetHour = Number(offsetHourStr);
  const offsetMinute = Number(offsetMinuteStr);
  if (offsetHour > 14 || offsetMinute > 59) return false;
  return offsetHour < 14 || offsetMinute === 0;
}
