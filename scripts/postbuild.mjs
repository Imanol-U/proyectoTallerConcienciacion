#!/usr/bin/env node
/**
 * Completa la carpeta `.next/standalone` después de `next build`.
 *
 * El servidor autocontenido de Next.js no incluye por sí solo los ficheros
 * estáticos ni lo que nuestro código lee del disco en tiempo de ejecución:
 *   - public/        (vídeos guía, miniaturas, detector de caras)
 *   - .next/static/  (JS y CSS de la aplicación)
 *   - fonts/         (Inter-Bold.ttf para la marca de agua)
 *
 * Con esto, `npm start` funciona en local igual que dentro de Docker.
 */
import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

try {
  await stat(path.join(standalone, "server.js"));
} catch {
  console.error("[postbuild] No existe .next/standalone/server.js. ¿Ha terminado bien `next build`?");
  process.exit(1);
}

const COPIES = [
  ["public", "public"],
  [path.join(".next", "static"), path.join(".next", "static")],
  ["fonts", "fonts"],
];

for (const [from, to] of COPIES) {
  const target = path.join(standalone, to);
  await rm(target, { recursive: true, force: true });
  await cp(path.join(root, from), target, { recursive: true });
}
console.log("[postbuild] .next/standalone listo: public/, .next/static/ y fonts/ copiados");
