export interface EetCryptoBackend {
  digest(algorithm: "SHA-1" | "SHA-256", data: Uint8Array): PromiseLike<Uint8Array>;
  hmacSha1(key: Uint8Array, data: Uint8Array): PromiseLike<Uint8Array>;
  randomUuid(): string;
}

export const webCryptoBackend: EetCryptoBackend = {
  async digest(algorithm, data) {
    return new Uint8Array(await crypto.subtle.digest(algorithm, data as BufferSource));
  },
  async hmacSha1(key, data) {
    const imported = await crypto.subtle.importKey(
      "raw",
      key as BufferSource,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data as BufferSource));
  },
  randomUuid: () => crypto.randomUUID(),
};

export async function sha256(
  data: Uint8Array,
  backend: EetCryptoBackend = webCryptoBackend,
): Promise<Uint8Array> {
  return backend.digest("SHA-256", data);
}
