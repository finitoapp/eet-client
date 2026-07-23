/**
 * Built-in validator for `@finito/eet-client`, imported from `@finito/eet-client/builtin`: a
 * hand-rolled, dependency-free alternative to `@finito/eet-client/zod`. The main
 * `@finito/eet-client` entry point never imports this module, so consumers who validate with
 * zod (or their own validator) never pull it in. See the README for a usage example.
 */
export { parseEetReceiptData, parseHeader } from "./validate.ts";
