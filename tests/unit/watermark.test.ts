import { afterEach, describe, expect, it } from "vitest";
import {
  buildWatermarkFilter,
  burnWatermark,
  WATERMARK_COMMENT,
} from "@/lib/watermark";
import { grayFrame, lumaRange, makeSampleVideo, meanLuma, probe } from "../support/media";

describe("marca de agua", () => {
  afterEach(() => {
    delete process.env.WATERMARK_FONT_PATH;
    delete process.env.FFMPEG_PATH;
  });

  it("quema la marca, quita el audio y limpia los metadatos", async () => {
    const original = await makeSampleVideo({ seconds: 2, gray: 128 });

    // El vídeo de partida tiene audio y un título: así la prueba demuestra algo.
    const before = await probe(original);
    expect(before.streams.some((s) => s.codec_type === "audio")).toBe(true);
    expect(before.format.tags?.title).toBe("origen-sin-marca");

    const marked = await burnWatermark(original);
    expect(marked.equals(original)).toBe(false);

    const after = await probe(marked);
    expect(after.streams).toHaveLength(1);
    expect(after.streams[0]).toMatchObject({
      codec_type: "video",
      codec_name: "h264",
      pix_fmt: "yuv420p",
      width: 512,
      height: 512,
    });
    expect(after.format.tags?.comment).toBe(WATERMARK_COMMENT);
    expect(after.format.tags?.title).toBeUndefined();

    const frame = await grayFrame(marked, 1);
    const { width: w, height: h } = frame;

    // Zona sin marca (esquina superior izquierda): sigue siendo el gris original.
    const plain = meanLuma(frame, 8, 8, 60, 60);
    expect(plain).toBeGreaterThan(110);
    expect(plain).toBeLessThan(146);

    // Franja inferior: caja negra al 70 % sobre el gris → mucho más oscura.
    const bandTop = Math.round(h * 0.91);
    const bandEdge = meanLuma(frame, 4, bandTop + 4, 44, h - 4);
    expect(bandEdge).toBeLessThan(plain * 0.5);

    // Texto blanco opaco dentro de la franja.
    const bandText = lumaRange(frame, Math.round(w * 0.15), bandTop, Math.round(w * 0.85), h);
    expect(bandText.max).toBeGreaterThan(200);

    // Sin texto sobre la cara: el centro sigue siendo el gris original.
    const center = lumaRange(
      frame,
      Math.round(w * 0.1),
      Math.round(h * 0.43),
      Math.round(w * 0.9),
      Math.round(h * 0.57),
    );
    expect(center.max - center.min).toBeLessThan(12);
  });

  it("recorta la duración y admite tamaños impares", async () => {
    const odd = await makeSampleVideo({ seconds: 1, size: 510 });
    const marked = await burnWatermark(odd);
    const info = await probe(marked);
    expect(info.streams[0].width).toBe(510);
    expect(Number(info.format.duration)).toBeLessThanOrEqual(8.1);
  });

  it("si falla la marca no devuelve ningún vídeo", async () => {
    const original = await makeSampleVideo({ seconds: 1 });
    process.env.WATERMARK_FONT_PATH = "/no/existe/Inter-Bold.ttf";
    await expect(burnWatermark(original)).rejects.toThrow(/fuente de la marca de agua/);
  });

  it("rechaza entradas que no son vídeo", async () => {
    await expect(burnWatermark(Buffer.from("esto no es un mp4"))).rejects.toThrow();
  });

  it("escapa la ruta de la fuente dentro del filtro", () => {
    const filter = buildWatermarkFilter("/tmp/con:dos puntos/y 'comillas'/Inter-Bold.ttf");
    expect(filter).toContain("con\\:dos puntos");
    expect(filter).not.toContain("y 'comillas'/");
    expect(filter.match(/drawtext=/g)).toHaveLength(1);
    expect(filter).not.toContain("VIDEO FALSO");
    expect(filter).toContain("drawbox=y=ih-ih/10:w=iw:h=ih/10:color=black@0.7:t=fill");
  });
});
