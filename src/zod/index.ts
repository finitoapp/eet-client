/**
 * Optional zod v4 schemas for `@finito/eet-client`, imported from `@finito/eet-client/zod`.
 * `zod` is a peer dependency, not a regular dependency — install it yourself
 * (`bun add zod@^4`) to use this entry point. The main `@finito/eet-client` entry point never
 * imports zod, so consumers who use the built-in `parseEetReceiptData`/`parseHeader` validators
 * (or their own) never need it. These are raw schemas — call `.parse()`/`.safeParse()` yourself
 * and map failures to whatever error type you prefer. See the README for a usage example.
 */
export { EetHeaderZodSchema } from "./header.ts";
export { EetReceiptDataZodSchema } from "./receipt.ts";
