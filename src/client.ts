import { generateEetDateTime, generateUuid } from "./core/generate.ts";
import { parseAndVerifyResponse } from "./core/parse-response.ts";
import { buildSignedRequest } from "./core/sign.ts";
import { type Result, tryAsync } from "./result.ts";
import { sendSoapRequest } from "./transport/transport.ts";
import type { EetClientOptions } from "./types/client.ts";
import { createEetSignerError, createEetValidationError, type EetError } from "./types/errors.ts";
import type { EetHeader, EetSubmitOptions } from "./types/header.ts";
import type { EetReceiptData } from "./types/receipt.ts";
import type { EetSubmitOutcome } from "./types/result.ts";

/** Low-level EET 2.0 client returned by {@link EetClient}. */
export interface EetClient {
  submit(
    data: EetReceiptData,
    options: EetSubmitOptions,
  ): Promise<Result<EetSubmitOutcome, EetError>>;
}

/**
 * Builds a low-level EET 2.0 client: builds, signs, sends, and verifies exactly one
 * `OdeslaniTrzby` SOAP request per {@link EetClient.submit} call. Holds no domain/cash-register
 * workflow and performs no retries — a resend is a new call with a new `uuid` and
 * `firstSubmission: false`.
 *
 * `submit()` performs no validation of its own: `data` must already be an {@link EetReceiptData}
 * — parse a raw receipt with `parseEetReceiptData` from `@finitoapp/eet-client/builtin`, a zod
 * schema from `@finitoapp/eet-client/zod`, or any other validator producing the same branded type,
 * before calling it — and `options.uuid`/`options.sentAt`, if given, must already be branded —
 * `submit()` trusts both as-is. Omitted `uuid`/`sentAt` are filled in with
 * `generateUuid()`/`generateEetDateTime()`, correct by construction.
 */
export function createEetClient(options: EetClientOptions): EetClient {
  if (!options.responseSignatureVerifier) {
    throw createEetValidationError({
      message:
        "createEetClient requires responseSignatureVerifier; without it a confirmation can never be returned as accepted.",
      issues: ["responseSignatureVerifier"],
    });
  }
  if (!options.signer) {
    throw createEetValidationError({
      message: "createEetClient requires signer.",
      issues: ["signer"],
    });
  }
  if (!options.endpoint) {
    throw createEetValidationError({
      message: "createEetClient requires endpoint.",
      issues: ["endpoint"],
    });
  }
  const endpoint = options.endpoint;
  const signer = options.signer;
  const responseSignatureVerifier = options.responseSignatureVerifier;
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs;

  return {
    async submit(data, submitOptions) {
      const header: EetHeader = {
        uuid: submitOptions.uuid ?? generateUuid(),
        sentAt: submitOptions.sentAt ?? generateEetDateTime(),
        firstSubmission: submitOptions.firstSubmission,
        verification: submitOptions.verification ?? false,
      };

      const signResult = await tryAsync(
        () => buildSignedRequest(data, header, signer),
        (error) =>
          createEetSignerError({
            message: "signer failed to produce a certificate or signature.",
            cause: error,
          }),
      );
      if (!signResult.ok) return signResult;
      const signedXml = signResult.value;

      const httpResult = await sendSoapRequest({
        endpoint,
        body: signedXml,
        fetchImpl,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      if (!httpResult.ok) return httpResult;
      const httpResponse = httpResult.value;

      return parseAndVerifyResponse(httpResponse.bodyText, {
        httpStatus: httpResponse.httpStatus,
        responseSignatureVerifier,
        ...(httpResponse.globalTransactionId !== undefined
          ? { globalTransactionId: httpResponse.globalTransactionId }
          : {}),
      });
    },
  };
}
