import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    zod: "src/zod/index.ts",
    builtin: "src/builtin/index.ts",
    "caeet-renewal": "src/caeet-renewal/index.ts",
    pkcs12: "src/pkcs12/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  // Declared explicitly, matching README's supported-runtimes table, rather than left to derive
  // implicitly from package.json's `engines.node` (which says nothing about browser support).
  // `platform: "neutral"` was tried first but rejected: it changes tsdown's own output filename
  // convention (.mjs/.d.mts -> plain .js/.d.ts), which breaks the extension-based ESM/CJS
  // disambiguation `package.json`'s `exports` map relies on. `"node"` is also an accurate,
  // literal description of tsdown's own docs ("Node.js and compatible runtimes (e.g., Deno,
  // Bun)") for 3 of the 4 runtimes in the table above; the browser consumes the same ESM output
  // via a bundler or native `<script type=module>`, unaffected by this setting since the SDK
  // uses zero `node:` imports for it to (not) externalize. `target` combines the minimum Node
  // version with tsdown's "baseline-widely-available" browser set (Chrome/Edge 111+, Firefox
  // 114+, Safari/iOS 16.4+) as a concrete stand-in for README's "any modern browser".
  platform: "node",
  target: ["node22", "baseline-widely-available"],
});
