import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@client": path.resolve(projectRoot, "apps/web/src"),
      "@api": path.resolve(projectRoot, "apps/api/src"),
      "@shared": path.resolve(projectRoot, "packages/domain/src"),
      "@tpqr/domain": path.resolve(projectRoot, "packages/domain/src"),
      "@tpqr/content": path.resolve(projectRoot, "packages/content/src"),
      "@tpqr/qr": path.resolve(projectRoot, "packages/qr/src"),
      "@tpqr/ui": path.resolve(projectRoot, "packages/ui/src"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/tmp/**", "**/output/**", "**/archive/**"],
    // The local SQLite/object-store runtime can cold-start a media request on
    // Windows. Keep the assertion strict while allowing that first request.
    testTimeout: 15_000,
    include: ["tests/integration/**/*.test.ts"],
    reporters: ["default"],
    setupFiles: ["tests/integration/setup.ts"],
  },
});
