import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` solo tiene sentido dentro del empaquetado de Next.js.
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 30_000,
    // Los módulos guardan estado en memoria (límites, almacén): cada fichero
    // de pruebas corre en su propio proceso para no pisarse.
    pool: "forks",
  },
});
