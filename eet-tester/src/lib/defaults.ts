import { EetEndpoint } from "@finitoapp/eet-client";

/** Mirrors `EetReceiptDataInput`, but every field is a plain string/boolean for direct binding to
 * form controls, and optional fields get an explicit `has*` toggle instead of being left
 * `undefined` — `EetReceiptData`'s optional fields must be omitted entirely, never set to
 * `undefined` (`exactOptionalPropertyTypes`), so the toggle is what lets `toReceiptDataInput`
 * (in `eet.ts`) build that object conditionally. */
export interface ReceiptFormState {
  readonly eic_popl: string;
  readonly hasEicPoverujiciho: boolean;
  readonly eic_poverujiciho: string;
  readonly povereni_vice_popl: boolean;
  readonly id_jednotky: string;
  readonly id_pokl: string;
  readonly porad_cis: string;
  readonly dat_trzby: string;
  readonly celk_trzba: string;
  readonly hasUrcenoCerpZuct: boolean;
  readonly urceno_cerp_zuct: string;
  readonly hasCerpZuct: boolean;
  readonly cerp_zuct: string;
}

export type HeaderFieldMode = "auto" | "manual";

export interface HeaderFormState {
  readonly firstSubmission: boolean;
  readonly verification: boolean;
  readonly uuidMode: HeaderFieldMode;
  readonly uuid: string;
  readonly sentAtMode: HeaderFieldMode;
  readonly sentAt: string;
}

export type EndpointKind = "playground" | "custom";

export interface EndpointFormState {
  readonly kind: EndpointKind;
  readonly customUrl: string;
  readonly timeoutMs: string;
}

/** Formats `date` as an EET-shaped `dateTime` with an explicit numeric UTC offset (never `Z`),
 * matching `DATE_TIME_PATTERN` (`^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$`). */
export function formatEetDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutesTotal = -date.getTimezoneOffset();
  const sign = offsetMinutesTotal >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutesTotal) / 60));
  const offsetMinutes = pad(Math.abs(offsetMinutesTotal) % 60);
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${datePart}T${timePart}${sign}${offsetHours}:${offsetMinutes}`;
}

/** Default receipt fields, seeded from the values in the main README's quick-start example
 * (a real, structurally valid playground DIČ/provozovna/pokladna combination). */
export function createDefaultReceiptForm(): ReceiptFormState {
  return {
    eic_popl: "CZ8551015704",
    hasEicPoverujiciho: false,
    eic_poverujiciho: "",
    povereni_vice_popl: false,
    id_jednotky: "181",
    id_pokl: "00/2535/CN58",
    porad_cis: "0/2482/IE25",
    dat_trzby: formatEetDateTime(new Date()),
    celk_trzba: "100.00",
    hasUrcenoCerpZuct: false,
    urceno_cerp_zuct: "0.00",
    hasCerpZuct: false,
    cerp_zuct: "0.00",
  };
}

export function createDefaultHeaderForm(): HeaderFormState {
  return {
    firstSubmission: true,
    verification: false,
    uuidMode: "auto",
    uuid: crypto.randomUUID(),
    sentAtMode: "auto",
    sentAt: formatEetDateTime(new Date()),
  };
}

export function createDefaultEndpointForm(): EndpointFormState {
  return {
    kind: "playground",
    customUrl: EetEndpoint.playground,
    timeoutMs: "30000",
  };
}
