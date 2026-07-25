/**
 * Built-in validator for `@finitoapp/eet-client`, imported from `@finitoapp/eet-client/builtin`: a
 * hand-rolled, dependency-free alternative to `@finitoapp/eet-client/zod`. The main
 * `@finitoapp/eet-client` entry point never imports this module, so consumers who validate with
 * zod (or their own validator) never pull it in. See the README for a usage example.
 */
export { parseEetReceiptData, parseHeader } from "./validate.ts";
