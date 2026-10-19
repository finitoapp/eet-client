import { err, ok, type Result } from "@finitoapp/eet-client";
import type { EndpointFormState, HeaderFormState, ReceiptFormState } from "./defaults.ts";

/** Everything persisted between page loads. Deliberately excludes the certificate/password state
 * (see `App.tsx`), which lives only in memory and is never written here. */
interface PersistedState {
  readonly receiptForm: ReceiptFormState;
  readonly headerForm: HeaderFormState;
  readonly endpointForm: EndpointFormState;
}

const STORAGE_KEY = "eet-tester:form-state:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReceiptForm(value: unknown): value is ReceiptFormState {
  return (
    isRecord(value) &&
    typeof value["eic_popl"] === "string" &&
    typeof value["hasEicPoverujiciho"] === "boolean" &&
    typeof value["eic_poverujiciho"] === "string" &&
    typeof value["povereni_vice_popl"] === "boolean" &&
    typeof value["id_jednotky"] === "string" &&
    typeof value["id_pokl"] === "string" &&
    typeof value["porad_cis"] === "string" &&
    typeof value["dat_trzby"] === "string" &&
    typeof value["celk_trzba"] === "string" &&
    typeof value["hasUrcenoCerpZuct"] === "boolean" &&
    typeof value["urceno_cerp_zuct"] === "string" &&
    typeof value["hasCerpZuct"] === "boolean" &&
    typeof value["cerp_zuct"] === "string"
  );
}

function isHeaderForm(value: unknown): value is HeaderFormState {
  return (
    isRecord(value) &&
    typeof value["firstSubmission"] === "boolean" &&
    typeof value["verification"] === "boolean" &&
    (value["uuidMode"] === "auto" || value["uuidMode"] === "manual") &&
    typeof value["uuid"] === "string" &&
    (value["sentAtMode"] === "auto" || value["sentAtMode"] === "manual") &&
    typeof value["sentAt"] === "string"
  );
}

function isEndpointForm(value: unknown): value is EndpointFormState {
  return (
    isRecord(value) &&
    (value["kind"] === "playground" || value["kind"] === "custom") &&
    typeof value["customUrl"] === "string" &&
    typeof value["timeoutMs"] === "string"
  );
}

export function loadPersistedState(): Partial<PersistedState> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    return {
      ...(isReceiptForm(parsed["receiptForm"]) ? { receiptForm: parsed["receiptForm"] } : {}),
      ...(isHeaderForm(parsed["headerForm"]) ? { headerForm: parsed["headerForm"] } : {}),
      ...(isEndpointForm(parsed["endpointForm"]) ? { endpointForm: parsed["endpointForm"] } : {}),
    };
  } catch {
    return undefined;
  }
}

export function savePersistedState(state: PersistedState): Result<void, unknown> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return ok();
  } catch (error) {
    return err(error);
  }
}
