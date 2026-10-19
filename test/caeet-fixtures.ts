import type { CaeetPkcs12Claim } from "../src/caeet-renewal/types.ts";

export const CAEET_REQUEST_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
export const CAEET_OTHER_REQUEST_ID = "12345678-1234-4234-8234-123456789abc";
export const CAEET_PKCS12_CLAIM = {
  pkcs12: "AQID",
  password: "ABcd1234",
  certificate: {
    sn: "24961511666821687692",
    validFrom: "2026-01-04 11:13:33+00:00",
    validTo: "2027-01-04T11:13:33.123Z",
    state: "VALID",
  },
} as const satisfies Omit<CaeetPkcs12Claim, "raw">;
