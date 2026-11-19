import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Ejecuta `fn` con un directorio temporal que se borra al terminar. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "eres-tu-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Vídeo de prueba SIN marca y CON pista de audio: gris liso, 512×512, 25 fps.
 * Imita lo que devolvería el modelo, con audio añadido para comprobar que la
 * marca de agua lo elimina.
 */
export async function makeSampleVideo(
  { seconds = 2, size = 512, gray = 128 }: { seconds?: number; size?: number; gray?: number } = {},
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const out = path.join(dir, "sample.mp4");
    const hex = gray.toString(16).padStart(2, "0");
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `color=c=0x${hex}${hex}${hex}:s=${size}x${size}:r=25:d=${seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
      "-metadata", "title=origen-sin-marca",
      out,
    ]);
    return readFile(out);
  });
}

export interface ProbeResult {
  streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; pix_fmt?: string }>;
  format: { duration: string; tags?: Record<string, string> };
}

export async function probe(video: Buffer): Promise<ProbeResult> {
  return withTempDir(async (dir) => {
    const file = path.join(dir, "probe.mp4");
    await writeFile(file, video);
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-print_format", "json", "-show_streams", "-show_format", file,
    ]);
    return JSON.parse(stdout) as ProbeResult;
  });
}

/** Un fotograma (en escala de grises, 8 bits) del vídeo, en el segundo indicado. */
export async function grayFrame(
  video: Buffer,
  atSeconds = 0.5,
): Promise<{ width: number; height: number; pixels: Buffer }> {
  return withTempDir(async (dir) => {
    const file = path.join(dir, "frame.mp4");
    const raw = path.join(dir, "frame.gray");
    await writeFile(file, video);
    const info = await probe(video);
    const stream = info.streams.find((s) => s.codec_type === "video");
    if (!stream?.width || !stream.height) throw new Error("sin pista de vídeo");
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(atSeconds), "-i", file,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", raw,
    ]);
    return { width: stream.width, height: stream.height, pixels: await readFile(raw) };
  });
}

/** Media de luminancia de un rectángulo del fotograma. */
export function meanLuma(
  frame: { width: number; pixels: Buffer },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      sum += frame.pixels[y * frame.width + x];
      count += 1;
    }
  }
  return sum / count;
}

/** Valores mínimo y máximo de luminancia en un rectángulo. */
export function lumaRange(
  frame: { width: number; pixels: Buffer },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { min: number; max: number } {
  let min = 255;
  let max = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const value = frame.pixels[y * frame.width + x];
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return { min, max };
}

/**
 * JPEG de prueba generado con ffmpeg (color liso). Con `exif: true` se le
 * inserta un segmento APP1 "Exif" con datos reconocibles, y con `trailing`
 * se le pega basura detrás del final de la imagen.
 */
export async function makeJpeg(
  { width = 512, height = 512, color = "0x6688aa" }: { width?: number; height?: number; color?: string } = {},
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const out = path.join(dir, "foto.jpg");
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `color=c=${color}:s=${width}x${height}:d=1`,
      "-frames:v", "1", "-q:v", "3", out,
    ]);
    return readFile(out);
  });
}

export const EXIF_MARKER_TEXT = "GPS-SECRETO-40.4168,-3.7038";

/** Inserta un segmento APP1 (Exif) justo detrás del SOI. */
export function withFakeExif(jpeg: Buffer): Buffer {
  const payload = Buffer.concat([
    Buffer.from("Exif\0\0", "latin1"),
    Buffer.from(EXIF_MARKER_TEXT, "latin1"),
  ]);
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = 0xe1;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

/** Inserta un segmento de comentario (COM) justo detrás del SOI. */
export function withComment(jpeg: Buffer, text: string): Buffer {
  const payload = Buffer.from(text, "latin1");
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = 0xfe;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}
