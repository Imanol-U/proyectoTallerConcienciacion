#!/usr/bin/env node
/**
 * Copia el motor WebAssembly del detector de caras (MediaPipe) desde
 * node_modules a public/mediapipe/wasm.
 *
 * Así el detector se sirve desde nuestro propio dominio (no desde un CDN de
 * terceros) y siempre coincide con la versión instalada del paquete. Se
 * ejecuta solo antes de `npm run dev`, `npm run build` y las pruebas.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = path.join(root, "public", "mediapipe", "wasm");

// Solo la variante clásica: es la que carga FilesetResolver.forVisionTasks().
const FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];

async function isUpToDate(from, to) {
  try {
    const [a, b] = await Promise.all([stat(from), stat(to)]);
    return a.size === b.size && b.mtimeMs >= a.mtimeMs;
  } catch {
    return false;
  }
}

await mkdir(target, { recursive: true });
let copied = 0;
for (const file of FILES) {
  const from = path.join(source, file);
  const to = path.join(target, file);
  if (await isUpToDate(from, to)) continue;
  try {
    await copyFile(from, to);
    copied += 1;
  } catch (error) {
    console.error(`[mediapipe] No se pudo copiar ${file}: ${error.message}`);
    console.error("[mediapipe] ¿Falta ejecutar `npm install`?");
    process.exit(1);
  }
}
if (copied > 0) console.log(`[mediapipe] ${copied} fichero(s) copiados a public/mediapipe/wasm`);
