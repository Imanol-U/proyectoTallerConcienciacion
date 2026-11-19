#!/usr/bin/env node
/**
 * Arranca la web en tu ordenador con el modelo de vídeo SIMULADO.
 *
 *   npm run demo:simulada          →  http://localhost:3000
 *
 * Sirve para recorrer los cinco pasos y enseñar la demo sin clave de OpenRouter y
 * sin gastar nada. Todo funciona de verdad (cámara,
 * detector de caras, recorte, límites, marca de agua con ffmpeg, borrado)
 * EXCEPTO el modelo: en lugar de animar tu cara, se devuelve siempre el
 * mismo vídeo de muestra (una cara dibujada). Por eso la web lo avisa arriba.
 *
 * En este modo tu foto no sale de tu ordenador y no se guarda en disco.
 * Para la demo real: `npm run dev` con OPENROUTER_API_KEY en .env.local.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "3000";

const mock = path.join(root, "tests", "support", "mock-modelo.mjs");
const face = path.join(root, "tests", "fixtures", "cara.png");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

for (const [file, hint] of [
  [nextBin, "Ejecuta antes `npm install`."],
  [mock, "Falta la carpeta tests/ del proyecto."],
  [face, "Falta la carpeta tests/fixtures del proyecto."],
]) {
  if (!existsSync(file)) {
    console.error(`No se encuentra ${path.relative(root, file)}. ${hint}`);
    process.exit(1);
  }
}

try {
  await run("ffmpeg", ["-version"]);
} catch {
  console.error("No se encuentra ffmpeg. Instálalo y vuelve a intentarlo:");
  console.error("  Windows:  winget install ffmpeg      macOS:  brew install ffmpeg      Linux:  sudo apt install ffmpeg");
  process.exit(1);
}

// El detector de caras se sirve desde nuestra propia web.
await run(process.execPath, [path.join(root, "scripts", "sync-mediapipe.mjs")]);

const work = await mkdtemp(path.join(tmpdir(), "eres-tu-demo-"));
// Lo que «devuelve el modelo»: un vídeo SIN marca y CON audio. La aplicación
// le quema la marca y le quita el audio, igual que haría con uno de verdad.
await run("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-loop", "1", "-i", face,
  "-f", "lavfi", "-i", "sine=frequency=330:duration=4",
  "-vf", "zoompan=z='1+0.05*sin(2*PI*on/50)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=100:s=512x512:fps=25",
  "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
  path.join(work, "sin-marca.mp4"),
]);
// Unos segundos de espera simulada, para que se vea la pantalla de «Fabricando tu vídeo».
await writeFile(path.join(work, "control.json"), JSON.stringify({ mode: "ok", delayMs: 7000 }));

console.log(`
  ¿Eres tú? — MODO SIMULADO
  ─────────────────────────────────────────────────────────────
  Abre  http://localhost:${port}

  El vídeo final es una muestra (una cara dibujada), no tu cara:
  aquí no se llama a ningún servicio de IA.
  Para parar: Ctrl + C
  ─────────────────────────────────────────────────────────────
`);

const preload = `--import=${pathToFileURL(mock).href}`;
const child = spawn(process.execPath, [nextBin, "dev", "--port", port], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    DEMO_ENABLED: "true",
    UPLOAD_ENABLED: "true",
    // Sin límite práctico: es tu ordenador y no cuesta nada.
    MAX_PER_IP_PER_DAY: "100",
    MAX_GLOBAL_PER_DAY: "1000",
    OPENROUTER_API_KEY: "simulada",
    MODELO_SIMULADO: "true",
    MOCK_MODELO_DIR: work,
    MOCK_MODELO_RECORD: "false",
    NODE_OPTIONS: [process.env.NODE_OPTIONS, preload].filter(Boolean).join(" "),
  },
});

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  await rm(work, { recursive: true, force: true }).catch(() => {});
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.once("exit", async (code) => {
  await cleanup();
  process.exit(code ?? 0);
});
