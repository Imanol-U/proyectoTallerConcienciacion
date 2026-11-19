import "server-only";
import { spawn } from "node:child_process";
import { access, constants, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getConfig, MAX_VIDEO_SECONDS } from "./config";

/**
 * Envoltorio de ffmpeg: quema la marca de agua en los píxeles del vídeo.
 *
 *  - Franja inferior opaca con "Generado por IA - demo educativa".
 *  - Sin audio (-an), sin metadatos de origen y con un comentario que declara
 *    que es contenido generado por IA.
 *
 * Es el ÚNICO camino por el que un vídeo llega al almacén temporal.
 */

export const WATERMARK_BAND_TEXT = "Generado por IA - demo educativa";
export const WATERMARK_COMMENT = "AI-generated. Educational deepfake demo.";

/** Ningún vídeo servido dura más de MAX_VIDEO_SECONDS: si el modelo devuelve más, se corta. */
const FFMPEG_TIMEOUT_MS = 90_000;
const MAX_CONCURRENT = 2;

/**
 * ffmpeg interpreta el texto de un filtro en dos pasadas: primero el grafo
 * (comillas simples) y después las opciones del filtro (`:` y `\`). Esta
 * función prepara un valor para que sobreviva intacto a las dos.
 */
function filterValue(value: string): string {
  const forOption = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
  return `'${forOption.replace(/'/g, "'\\''")}'`;
}

export function resolveFontPath(): string {
  return (
    getConfig().watermarkFontPath ??
    path.join(/* turbopackIgnore: true */ process.cwd(), "fonts", "Inter-Bold.ttf")
  );
}

export function buildWatermarkFilter(fontPath: string): string {
  // En Windows, C:\\ruta\\fuente.ttf → C:/ruta/fuente.ttf (ffmpeg lo acepta igual).
  const font = filterValue(fontPath.replace(/\\/g, "/"));
  return [
    // Dimensiones pares: lo exige yuv420p.
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "drawbox=y=ih-ih/10:w=iw:h=ih/10:color=black@0.7:t=fill",
    `drawtext=fontfile=${font}:text=${filterValue(WATERMARK_BAND_TEXT)}:fontsize=h/22:fontcolor=white:x=(w-text_w)/2:y=h-h/10+(h/10-text_h)/2`,
  ].join(",");
}

export function buildWatermarkArgs(inputPath: string, outputPath: string, fontPath: string): string[] {
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-nostdin",
    "-y",
    "-i", inputPath,
    // Solo la primera pista de vídeo: ni audio, ni subtítulos, ni datos.
    "-map", "0:v:0",
    "-an", "-sn", "-dn",
    "-vf", buildWatermarkFilter(fontPath),
    "-t", String(MAX_VIDEO_SECONDS),
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-metadata", `comment=${WATERMARK_COMMENT}`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-f", "mp4",
    outputPath,
  ];
}

function runFfmpeg(args: string[]): Promise<void> {
  const { ffmpegPath } = getConfig();
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-2000);
    });
    const killer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(killer);
      reject(new Error(`No se pudo ejecutar ffmpeg (${ffmpegPath}): ${error.message}`));
    });
    child.once("close", (code, signal) => {
      clearTimeout(killer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg terminó con ${signal ?? `código ${code}`}: ${stderr.trim()}`));
    });
  });
}

// Cola mínima: como mucho MAX_CONCURRENT codificaciones a la vez, para no
// ahogar un contenedor pequeño.
let running = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    running += 1;
  }
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

function looksLikeMp4(data: Buffer): boolean {
  return data.length > 512 && data.subarray(4, 8).toString("latin1") === "ftyp";
}

/**
 * Devuelve el vídeo con la marca quemada. Si algo falla, lanza un error:
 * nunca devuelve el vídeo de entrada.
 */
export async function burnWatermark(input: Buffer): Promise<Buffer> {
  return withSlot(async () => {
    // Con fontconfig, ffmpeg sustituye en silencio una fuente que no existe.
    // Preferimos fallar: una imagen mal construida debe notarse enseguida.
    const fontPath = resolveFontPath();
    try {
      await access(fontPath, constants.R_OK);
    } catch {
      throw new Error(`No se encuentra la fuente de la marca de agua: ${fontPath}`);
    }
    const workDir = await mkdtemp(path.join(tmpdir(), "eres-tu-wm-"));
    const inputPath = path.join(workDir, "entrada.mp4");
    const outputPath = path.join(workDir, "salida.mp4");
    try {
      await writeFile(inputPath, input, { mode: 0o600 });
      await runFfmpeg(buildWatermarkArgs(inputPath, outputPath, fontPath));
      const output = await readFile(outputPath);
      if (!looksLikeMp4(output)) {
        throw new Error("ffmpeg no produjo un mp4 válido");
      }
      return output;
    } finally {
      // El vídeo sin marca no sobrevive a esta función.
      await rm(workDir, { recursive: true, force: true });
    }
  });
}
