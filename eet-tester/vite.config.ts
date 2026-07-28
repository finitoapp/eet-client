import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Alias straight to the SDK's TypeScript sources instead of its published `dist/` output. This is
// the whole point of eet-tester consuming the SDK as a workspace dependency: it always exercises
// the current (possibly unreleased) code, with no `bun run build` step required in the parent
// package before running the tester. The SDK has no `node:` imports and Vite resolves the
// explicit `.ts` extensions its source files use internally, so this works without any change to
// the library itself. The trade-off: this bypasses the package's `exports` map and `dist/` build
// entirely — remove these aliases (and add `@finitoapp/eet-client` as a real dependency resolved
// from `dist/`) to verify against what actually gets published.
const sdkSrc = fileURLToPath(new URL("../src", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@finitoapp/eet-client/builtin": `${sdkSrc}/builtin/index.ts`,
      "@finitoapp/eet-client/pkcs12": `${sdkSrc}/pkcs12/index.ts`,
      "@finitoapp/eet-client": `${sdkSrc}/index.ts`,
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
