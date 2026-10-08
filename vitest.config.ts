import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Mirror the tsconfig path alias (`@/*` -> repo root) so unit tests can import
// modules by their `@/` path, matching the app. Test discovery is unchanged.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
