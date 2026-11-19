import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MOCK_DIR } from "../../playwright.config";
import { makeSampleVideo } from "../support/media";

/** Prepara lo que necesita el OpenRouter simulado antes de la primera prueba. */
export default async function globalSetup(): Promise<void> {
  const root = path.resolve(__dirname, "../..");
  if (!existsSync(path.join(root, ".next", "standalone", "server.js"))) {
    throw new Error("Falta la aplicación compilada. Ejecuta `npm run build` antes de `npm run test:e2e`.");
  }

  await mkdir(MOCK_DIR, { recursive: true });
  await rm(path.join(MOCK_DIR, "calls.jsonl"), { force: true });
  await rm(path.join(MOCK_DIR, "uploads"), { recursive: true, force: true });
  await mkdir(path.join(MOCK_DIR, "uploads"), { recursive: true });
  await writeFile(path.join(MOCK_DIR, "control.json"), JSON.stringify({ mode: "ok", delayMs: 300 }));

  // Lo que "devuelve el modelo": un vídeo SIN marca y CON audio. Si algo de
  // esto llegara al navegador, las pruebas lo detectarían.
  await writeFile(path.join(MOCK_DIR, "sin-marca.mp4"), await makeSampleVideo({ seconds: 4, gray: 128 }));
}
