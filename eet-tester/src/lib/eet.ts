import {
  createEetClient,
  type EetError,
  type EetHeaderInput,
  type EetReceiptDataInput,
  type EetSigner,
  type EetSubmitOptions,
  type EetSubmitOutcome,
  isEetError,
  type ResponseSignatureVerifier,
  serializeUnsignedRequest,
} from "@finitoapp/eet-client";
import { parseEetReceiptData, parseHeader } from "@finitoapp/eet-client/builtin";
import { formatEetDateTime, type HeaderFormState, type ReceiptFormState } from "./defaults.ts";
import { describeError } from "./errors.ts";

/** Builds `EetReceiptDataInput`, omitting each optional field entirely when its toggle is off —
 * `EetReceiptData`'s optional fields must never be set to `undefined` explicitly. */
export function toReceiptDataInput(form: ReceiptFormState): EetReceiptDataInput {
  return {
    eic_popl: form.eic_popl,
    ...(form.hasEicPoverujiciho
      ? { eic_poverujiciho: form.eic_poverujiciho, povereni_vice_popl: form.povereni_vice_popl }
      : {}),
    id_jednotky: form.id_jednotky,
    id_pokl: form.id_pokl,
    porad_cis: form.porad_cis,
    dat_trzby: form.dat_trzby,
    celk_trzba: form.celk_trzba,
    ...(form.hasUrcenoCerpZuct ? { urceno_cerp_zuct: form.urceno_cerp_zuct } : {}),
    ...(form.hasCerpZuct ? { cerp_zuct: form.cerp_zuct } : {}),
  };
}

/** Resolves a fully-populated `EetHeaderInput` for validation: fields left in "auto" mode get a
 * freshly generated placeholder here so the whole header can be validated/branded as one shape,
 * even though {@link toSubmitOptions} later omits exactly those fields so the client generates
 * its own values instead of reusing this placeholder. */
function resolveHeaderInput(form: HeaderFormState): EetHeaderInput {
  return {
    uuid: form.uuidMode === "manual" ? form.uuid : crypto.randomUUID(),
    sentAt: form.sentAtMode === "manual" ? form.sentAt : formatEetDateTime(new Date()),
    firstSubmission: form.firstSubmission,
    verification: form.verification,
  };
}

export type ValidationFailure =
  | { readonly kind: "invalidReceipt"; readonly issues: readonly string[] }
  | { readonly kind: "invalidHeader"; readonly issues: readonly string[] };

export interface PreviewXmlSuccess {
  readonly kind: "xml";
  readonly xml: string;
}

/** Renders the unsigned (no WS-Security) SOAP request for the current form state, without
 * sending anything — useful to inspect what would be sent before committing to a real submit. */
export function previewUnsignedXml(
  receiptForm: ReceiptFormState,
  headerForm: HeaderFormState,
): PreviewXmlSuccess | ValidationFailure {
  const receipt = parseEetReceiptData(toReceiptDataInput(receiptForm));
  if (!receipt.ok) return { kind: "invalidReceipt", issues: receipt.error.issues };

  const header = parseHeader(resolveHeaderInput(headerForm));
  if (!header.ok) return { kind: "invalidHeader", issues: header.error.issues };

  return { kind: "xml", xml: serializeUnsignedRequest(receipt.value, header.value) };
}

/** Captures the raw request/response bodies of one `fetch` call for display, by wrapping the
 * `fetch` implementation passed to `createEetClient` — the only seam the SDK exposes for this,
 * since `EetSubmitOutcome` itself carries no raw XML. */
export interface FetchCapture {
  request: string | undefined;
  response: string | undefined;
}

export function createCapturingFetch(capture: FetchCapture): typeof fetch {
  return async (input, init) => {
    if (init?.body instanceof Uint8Array) {
      capture.request = new TextDecoder().decode(init.body);
    }
    const response = await window.fetch(input, init);
    capture.response = await response.clone().text();
    return response;
  };
}

export interface SubmitParams {
  readonly endpoint: string;
  readonly timeoutMs: number | undefined;
  readonly signer: EetSigner;
  readonly responseSignatureVerifier: ResponseSignatureVerifier;
  readonly receiptForm: ReceiptFormState;
  readonly headerForm: HeaderFormState;
}

interface RawExchange {
  readonly requestXml: string | undefined;
  readonly responseXml: string | undefined;
}

export type SubmitResult =
  | (RawExchange & { readonly kind: "outcome"; readonly outcome: EetSubmitOutcome })
  | (RawExchange & { readonly kind: "error"; readonly error: EetError })
  | ValidationFailure
  | { readonly kind: "unexpected"; readonly message: string };

export async function submitReceipt(params: SubmitParams): Promise<SubmitResult> {
  const receipt = parseEetReceiptData(toReceiptDataInput(params.receiptForm));
  if (!receipt.ok) return { kind: "invalidReceipt", issues: receipt.error.issues };

  const header = parseHeader(resolveHeaderInput(params.headerForm));
  if (!header.ok) return { kind: "invalidHeader", issues: header.error.issues };

  const capture: FetchCapture = { request: undefined, response: undefined };

  try {
    const client = createEetClient({
      endpoint: params.endpoint,
      signer: params.signer,
      responseSignatureVerifier: params.responseSignatureVerifier,
      fetch: createCapturingFetch(capture),
      ...(params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}),
    });

    const submitOptions: EetSubmitOptions = {
      firstSubmission: header.value.firstSubmission,
      verification: header.value.verification,
      ...(params.headerForm.uuidMode === "manual" ? { uuid: header.value.uuid } : {}),
      ...(params.headerForm.sentAtMode === "manual" ? { sentAt: header.value.sentAt } : {}),
    };

    const result = await client.submit(receipt.value, submitOptions);

    return result.ok
      ? {
          kind: "outcome",
          outcome: result.value,
          requestXml: capture.request,
          responseXml: capture.response,
        }
      : {
          kind: "error",
          error: result.error,
          requestXml: capture.request,
          responseXml: capture.response,
        };
  } catch (cause) {
    if (isEetError(cause, "EetValidationError")) {
      return {
        kind: "error",
        error: cause,
        requestXml: capture.request,
        responseXml: capture.response,
      };
    }
    return { kind: "unexpected", message: describeError(cause) };
  }
}
