/**
 * Pure JS/Web Crypto PKCS#12 (`.p12`/PFX) parser, imported from `@finitoapp/eet-client/pkcs12`:
 * no Node `crypto`/`tls`, no native/WASM dependency, works identically in Node, Bun, Deno, and
 * the browser. The main `@finitoapp/eet-client` entry point never imports this module — see
 * `parse.ts`'s doc comment for exactly what's supported (password privacy/integrity mode,
 * `pbeWithSHA1And{40,128}BitRC2-CBC` cert bags, `pbeWithSHA1And{2,3}-KeyTripleDES-CBC` shrouded
 * key bags) and what isn't.
 */
export {
  createPkcs12InvalidMacError,
  createPkcs12MalformedError,
  isPkcs12Error,
  type Pkcs12Error,
  type Pkcs12InvalidMacError,
  type Pkcs12MalformedError,
} from "./errors.ts";
export {
  type Pkcs12Certificate,
  type Pkcs12Contents,
  type Pkcs12PrivateKey,
  parsePkcs12,
  pickPrivateKeyCertificate,
} from "./parse.ts";
