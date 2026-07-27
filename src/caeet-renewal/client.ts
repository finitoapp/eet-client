import type { Result } from "../result.ts";
import {
  ackCaeetPkcs12Download,
  claimCaeetPkcs12,
  getCaeetRenewalStatus,
  listUnfinishedCaeetRequests,
  requestCaeetRenewal,
} from "./endpoints.ts";
import { type CaeetError, createCaeetValidationError } from "./errors.ts";
import type {
  CaeetPkcs12Claim,
  CaeetRenewalRequest,
  CaeetRenewalRequestOptions,
  CaeetRenewalStatus,
  CaeetUnfinishedRequests,
} from "./types.ts";

/** Low-level CA EET renewal API client returned by {@link createCaeetRenewalClient}. */
export interface CaeetRenewalClient {
  requestRenewal(): Promise<Result<CaeetRenewalRequest, CaeetError>>;
  getStatus(reqId: string): Promise<Result<CaeetRenewalStatus, CaeetError>>;
  claimPkcs12(reqId: string): Promise<Result<CaeetPkcs12Claim, CaeetError>>;
  ackDownload(reqId: string): Promise<Result<{ raw: unknown }, CaeetError>>;
  listUnfinished(): Promise<Result<CaeetUnfinishedRequests, CaeetError>>;
}

/**
 * Builds a low-level CA EET renewal API client: every call signs a fresh JWT (per
 * {@link buildCaeetAuthorizationJwt}) with `options.signer`. Holds no polling loop — per "Příklad
 * sekvence volání" in the reference document, the caller polls `getStatus()` on its own schedule
 * (`pollAfterSeconds`/`retryAfterSeconds`) until the request leaves `INPROCESS`, the same stance
 * this SDK takes on `submit()` resends (see README, "Opakované odeslání").
 */
export function createCaeetRenewalClient(options: CaeetRenewalRequestOptions): CaeetRenewalClient {
  if (!options.baseUrl) {
    throw createCaeetValidationError({ message: "createCaeetRenewalClient requires baseUrl." });
  }
  if (!options.signer) {
    throw createCaeetValidationError({ message: "createCaeetRenewalClient requires signer." });
  }

  return {
    requestRenewal: () => requestCaeetRenewal(options),
    getStatus: (reqId) => getCaeetRenewalStatus(reqId, options),
    claimPkcs12: (reqId) => claimCaeetPkcs12(reqId, options),
    ackDownload: (reqId) => ackCaeetPkcs12Download(reqId, options),
    listUnfinished: () => listUnfinishedCaeetRequests(options),
  };
}
