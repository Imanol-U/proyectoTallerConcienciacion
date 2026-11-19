import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { sanitizeJpeg } from "@/lib/jpeg";
import { EXIF_MARKER_TEXT, makeJpeg, withComment, withFakeExif, withTempDir } from "../support/media";

const run = promisify(execFile);
const FIXTURES = path.resolve(__dirname, "../fixtures");

async function dimensions(jpeg: Buffer): Promise<{ width: number; height: number }> {
  return withTempDir(async (dir) => {
    const file = path.join(dir, "img.jpg");
    await writeFile(file, jpeg);
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "json", file,
    ]);
    return JSON.parse(stdout).streams[0];
  });
}

describe("sanitizeJpeg", () => {
  let jpeg: Buffer;

  beforeAll(async () => {
    jpeg = await makeJpeg();
  });

  it("acepta un JPEG válido y lee sus medidas", () => {
    const result = sanitizeJpeg(jpeg);
    expect(result).toMatchObject({ ok: true, width: 512, height: 512 });
  });

  it("devuelve una imagen que sigue siendo un JPEG válido", async () => {
    const result = sanitizeJpeg(withFakeExif(jpeg));
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(result.data.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(await dimensions(result.data)).toEqual({ width: 512, height: 512 });
  });

  it("elimina el EXIF", () => {
    const dirty = withFakeExif(jpeg);
    expect(dirty.includes(EXIF_MARKER_TEXT)).toBe(true);

    const result = sanitizeJpeg(dirty);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.includes(EXIF_MARKER_TEXT)).toBe(false);
    expect(result.data.includes("Exif")).toBe(false);
  });

  it("elimina los comentarios", () => {
    const result = sanitizeJpeg(withComment(jpeg, "hecho con la camara de Ana"));
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.includes("camara de Ana")).toBe(false);
    // ffmpeg también firma sus JPEG con un comentario "Lavc…".
    expect(result.data.includes("Lavc")).toBe(false);
  });

  it("corta cualquier dato pegado detrás del final de la imagen", () => {
    const polyglot = Buffer.concat([jpeg, Buffer.from("PK\x03\x04 datos-ocultos \xff\xd9 mas-datos", "latin1")]);
    const result = sanitizeJpeg(polyglot);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.includes("datos-ocultos")).toBe(false);
    expect(result.data.length).toBeLessThanOrEqual(jpeg.length);
  });

  it("limpia un JPEG progresivo real con EXIF (GPS), XMP y perfil ICC", async () => {
    const real = await readFile(path.join(FIXTURES, "progresivo-exif-512.jpg"));
    expect(real.includes("Exif")).toBe(true);
    expect(real.includes("ICC_PROFILE")).toBe(true);

    const result = sanitizeJpeg(real);
    if (!result.ok) throw new Error(result.reason);
    expect(result).toMatchObject({ width: 512, height: 512 });
    for (const trace of ["Exif", "ICC_PROFILE", "CamaraDePrueba", "http://ns.adobe.com"]) {
      expect(result.data.includes(trace)).toBe(false);
    }
    expect(await dimensions(result.data)).toEqual({ width: 512, height: 512 });
  });

  it("informa de las medidas reales aunque no sean 512×512", async () => {
    const wide = await makeJpeg({ width: 640, height: 480 });
    expect(sanitizeJpeg(wide)).toMatchObject({ ok: true, width: 640, height: 480 });
  });

  it("rechaza lo que no es un JPEG", () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    expect(sanitizeJpeg(png).ok).toBe(false);
    expect(sanitizeJpeg(Buffer.alloc(0)).ok).toBe(false);
    expect(sanitizeJpeg(Buffer.from("hola")).ok).toBe(false);
    expect(sanitizeJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9])).ok).toBe(false);
  });

  it("rechaza un JPEG truncado", () => {
    expect(sanitizeJpeg(jpeg.subarray(0, Math.floor(jpeg.length / 2))).ok).toBe(false);
    expect(sanitizeJpeg(jpeg.subarray(0, 40)).ok).toBe(false);
  });

  it("no se cuelga ni lanza con bytes aleatorios tras la cabecera", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const noise = Buffer.alloc(300);
      let x = seed;
      for (let i = 0; i < noise.length; i += 1) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        noise[i] = x & 0xff;
      }
      const candidate = Buffer.concat([Buffer.from([0xff, 0xd8]), noise]);
      expect(() => sanitizeJpeg(candidate)).not.toThrow();
    }
  });
});
