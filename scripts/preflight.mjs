#!/usr/bin/env node
/**
 * Comprobación previa a publicar.
 *
 *   npm run preflight
 *
 * Revisa lo que una máquina puede revisar: herramientas, ficheros, vídeos guía
 * y variables de entorno (las del entorno actual y, si existe, .env.local).
 * Termina con error si falta algo imprescindible.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const run = promisify(execFile);
let errors = 0;
let warnings = 0;

const ok = (text) => console.log(`  ✓ ${text}`);
const warn = (text) => {
  warnings += 1;
  console.log(`  ⚠ ${text}`);
};
const fail = (text) => {
  errors += 1;
  console.log(`  ✗ ${text}`);
};

function loadEnv() {
  const env = { ...process.env };
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    const [, key, raw] = match;
    if (env[key] === undefined) env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const env = loadEnv();

console.log("\nHerramientas");
{
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 12)) ok(`Node.js ${process.versions.node}`);
  else fail(`Node.js ${process.versions.node}: hace falta la versión 22.12 o posterior`);

  const ffmpeg = env.FFMPEG_PATH || "ffmpeg";
  try {
    const { stdout: filters } = await run(ffmpeg, ["-hide_banner", "-filters"]);
    const { stdout: encoders } = await run(ffmpeg, ["-hide_banner", "-encoders"]);
    if (/\bdrawtext\b/.test(filters)) ok("ffmpeg con el filtro drawtext (texto de la marca de agua)");
    else fail("ffmpeg no tiene el filtro drawtext: instala un ffmpeg compilado con libfreetype");
    if (/\blibx264\b/.test(encoders)) ok("ffmpeg con el codificador libx264");
    else fail("ffmpeg no tiene libx264");
  } catch {
    fail(`No se puede ejecutar ffmpeg (${ffmpeg})`);
  }
}

console.log("\nFicheros");
{
  const font = env.WATERMARK_FONT_PATH || path.join(ROOT, "fonts", "Inter-Bold.ttf");
  if (existsSync(font)) ok(`Fuente de la marca de agua: ${path.relative(ROOT, font)}`);
  else fail(`Falta la fuente de la marca de agua: ${font}`);

  const assets = [
    ["mediapipe/wasm/vision_wasm_internal.wasm", "Motor del detector de caras"],
    ["mediapipe/wasm/vision_wasm_internal.js", "Cargador del detector de caras"],
    ["models/blaze_face_short_range.tflite", "Modelo del detector de caras"],
  ];
  for (const [file, label] of assets) {
    if (existsSync(path.join(PUBLIC_DIR, file))) ok(label);
    else fail(`${label}: falta public/${file} (ejecuta \`node scripts/sync-mediapipe.mjs\`)`);
  }
}

console.log("\nMiniaturas de las animaciones");
{
  for (const id of ["saludo", "sonrisa", "sorpresa", "guino"]) {
    if (existsSync(path.join(PUBLIC_DIR, "previews", `${id}.mp4`))) ok(`${id}.mp4`);
    else fail(`falta public/previews/${id}.mp4`);
  }
}

console.log("\nVariables de entorno");
{
  if (env.OPENROUTER_API_KEY?.trim()) ok("OPENROUTER_API_KEY definida");
  else fail("OPENROUTER_API_KEY sin definir: no se podrá generar ningún vídeo");

  if (env.DEMO_ENABLED === "true") ok("DEMO_ENABLED=true (demo encendida)");
  else warn(`DEMO_ENABLED=${env.DEMO_ENABLED ?? "(vacía)"}: la web mostrará «demo en pausa»`);

  if (env.UPLOAD_ENABLED === "true") ok("UPLOAD_ENABLED=true (cámara y subida de fotos)");
  else ok("UPLOAD_ENABLED distinto de true: solo cámara");

  for (const [name, fallback] of [["MAX_PER_IP_PER_DAY", 3], ["MAX_GLOBAL_PER_DAY", 200]]) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") ok(`${name} sin definir: se usa ${fallback}`);
    else if (/^\d+$/.test(raw.trim())) ok(`${name}=${raw.trim()}`);
    else warn(`${name}="${raw}" no es un número entero: se usará ${fallback}`);
  }

  if (Number(env.COST_PER_VIDEO_EUR) > 0) ok(`COST_PER_VIDEO_EUR=${env.COST_PER_VIDEO_EUR}`);
  else warn("COST_PER_VIDEO_EUR sin definir: la web dirá «céntimos» sin dar cifra. Mira el coste real en el panel de OpenRouter.");

  if (env.ORG_NAME?.trim() && env.CONTACT_EMAIL?.trim()) ok("ORG_NAME y CONTACT_EMAIL definidas (aviso de privacidad)");
  else fail("Faltan ORG_NAME y/o CONTACT_EMAIL: el aviso de privacidad saldría con «pendiente de completar»");
}

console.log("\nA mano (esto no lo puede comprobar un guion)");
for (const item of [
  "Límite de crédito configurado para la clave en el panel de OpenRouter.",
  "Una sola instancia, siempre encendida (los límites y los vídeos viven en memoria).",
  "Texto de /privacidad revisado por alguien con conocimientos legales.",
]) {
  console.log(`  ☐ ${item}`);
}

console.log(
  errors > 0
    ? `\n${errors} problema(s) que impiden publicar${warnings ? ` y ${warnings} aviso(s)` : ""}.`
    : `\nTodo lo comprobable está en orden${warnings ? ` (${warnings} aviso(s))` : ""}.`,
);
process.exit(errors > 0 ? 1 : 0);
