/** One `<Varovani>` element: a non-critical, pass-through issue reported by the EET system. */
export interface EetWarning {
  /** `kod_varov`, 1–999. */
  readonly code: number;
  /** Text content of the `<Varovani>` element, if present. */
  readonly message?: string;
}

interface EetOutcomeBase {
  /** Raw HTTP status code of the response. */
  readonly httpStatus: number;
  /** Value of the `X-Global-Transaction-Id` response header, if present. */
  readonly globalTransactionId?: string;
}

/** The receipt was accepted, signed, and will be stored by the EET system (`<Potvrzeni>`). */
export interface EetAcceptedOutcome extends EetOutcomeBase {
  readonly status: "accepted";
  /** Confirmation code (`pok`). */
  readonly pok: string;
  /** UUID of the submitted message (`uuid_zpravy`), echoed back by the server. */
  readonly uuid: string;
  /** Time the message was received by the EET system (`dat_prij`). */
  readonly receivedAt: string;
  /** `true` when the response came from a non-production (playground) environment. */
  readonly test: boolean;
  /** Non-critical issues detected during processing (max. 10). */
  readonly warnings: readonly EetWarning[];
}

/**
 * A successful verification-mode round trip (`overeni: true`), i.e. a `<Chyba>` response with
 * `kod="0"`. No receipt was recorded and the response carries no signature.
 */
export interface EetVerificationOutcome extends EetOutcomeBase {
  readonly status: "verification";
  /** UUID of the submitted message, if echoed back by the server. */
  readonly uuid?: string;
  /** `true` when the response came from a non-production (playground) environment. */
  readonly test: boolean;
  /** Non-critical issues detected during processing (max. 10). */
  readonly warnings: readonly EetWarning[];
}

/**
 * The receipt was rejected because of a critical error, or was submitted in verification mode
 * and failed. This is a normal, expected outcome of `submit()`, not a thrown error; per the
 * specification a `<Chyba>` response never carries a signature.
 */
export interface EetRejectedOutcome extends EetOutcomeBase {
  readonly status: "rejected";
  /** EET error code (`kod`), see spec section 3.5.4. */
  readonly code: number;
  /** Error text (`Chyba` element content). */
  readonly message: string;
  /** UUID of the submitted message, if the server could determine and echo it back. */
  readonly uuid?: string;
  /** Time the message was rejected (`dat_odmit`), if available. */
  readonly rejectedAt?: string;
  /** `true` when the response came from a non-production (playground) environment. */
  readonly test: boolean;
  /** Non-critical issues detected during processing (max. 10). */
  readonly warnings: readonly EetWarning[];
}

/** Discriminated result of {@link EetClient.submit}. */
export type EetSubmitOutcome = EetAcceptedOutcome | EetVerificationOutcome | EetRejectedOutcome;
