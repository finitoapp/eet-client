import type { EndpointFormState, HeaderFormState, ReceiptFormState } from "./defaults.ts";

/** Everything persisted between page loads. Deliberately excludes the certificate/password state
 * (see `App.tsx`), which lives only in memory and is never written here. */
interface PersistedState {
  readonly receiptForm: ReceiptFormState;
  readonly headerForm: HeaderFormState;
  readonly endpointForm: EndpointFormState;
}

const STORAGE_KEY = "eet-tester:form-state:v1";

export function loadPersistedState(): Partial<PersistedState> | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return undefined;
  try {
    // `localStorage` content is fully caller-controlled (we're the only writer) but still
    // untrusted at the type level — a stale shape from a previous version of this app must not
    // crash the page, just be ignored.
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Partial<PersistedState>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function savePersistedState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
