/**
 * Preparación de la foto en el navegador.
 *
 * Venga de la cámara o de un archivo, la imagen se dibuja en un <canvas>, se
 * recorta a 512×512 y se exporta como JPEG (calidad 0,9). Así el servidor
 * recibe siempre el mismo formato y los metadatos del original (ubicación,
 * fecha, modelo de móvil) no salen nunca del dispositivo.
 */

export const PHOTO_SIZE = 512;
export const JPEG_QUALITY = 0.9;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");

/** Lado máximo de la copia de trabajo de una foto subida. */
const WORK_MAX_SIDE = 2048;

export type UploadProblem = "type" | "size" | "decode";

export const UPLOAD_MESSAGES: Record<UploadProblem, { title: string; body: string }> = {
  type: {
    title: "Ese tipo de archivo no vale",
    body: "Elige una foto en formato JPEG, PNG o WebP.",
  },
  size: {
    title: "La foto pesa demasiado",
    body: "El máximo son 10 MB. Prueba con otra foto o redúcela antes de subirla.",
  },
  decode: {
    title: "No hemos podido abrir esa imagen",
    body: "Puede que el archivo esté dañado. Prueba con otra foto en JPEG, PNG o WebP.",
  },
};

export function validateUpload(file: File): UploadProblem | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_UPLOAD_BYTES) return "size";
  return null;
}

export function createCanvas(width: number, height = width): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no permite dibujar en un lienzo.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/** Región cuadrada de la imagen de origen, en sus propios píxeles. */
export interface Crop {
  x: number;
  y: number;
  size: number;
}

/** Dibuja un recorte cuadrado de `source` ocupando todo el lienzo de destino. */
export function drawCrop(
  target: HTMLCanvasElement,
  source: CanvasImageSource,
  crop: Crop,
): void {
  const ctx = context2d(target);
  // Fondo blanco: JPEG no tiene transparencia (PNG y WebP sí).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(source, crop.x, crop.y, crop.size, crop.size, 0, 0, target.width, target.height);
}

/** Recorte cuadrado centrado: lo mismo que enseña `object-fit: cover`. */
export function centerCrop(width: number, height: number): Crop {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

/** Fotograma actual de la cámara, recortado al cuadrado central. */
export function captureVideoFrame(video: HTMLVideoElement, size = PHOTO_SIZE): HTMLCanvasElement {
  const canvas = createCanvas(size);
  drawCrop(canvas, video, centerCrop(video.videoWidth, video.videoHeight));
  return canvas;
}

/** Exporta el lienzo como JPEG. El resultado no lleva ningún metadato. */
export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo exportar la foto."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * Abre una foto subida y devuelve una copia de trabajo (como mucho 2048 px de
 * lado). El navegador aplica aquí la orientación EXIF, así que la copia ya
 * está derecha; el archivo original no se vuelve a usar.
 */
export async function loadWorkingCopy(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) throw new Error("imagen vacía");

    const scale = Math.min(1, WORK_MAX_SIDE / Math.max(width, height));
    const canvas = createCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const ctx = context2d(canvas);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Copia reducida de un lienzo (para analizarlo con el detector de caras). */
export function downscale(source: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = createCanvas(
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
  );
  context2d(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Mantiene el recorte dentro de la imagen y dentro de los límites de zoom. */
export function clampCrop(crop: Crop, width: number, height: number, maxZoom: number): Crop {
  const largest = Math.min(width, height);
  const size = clamp(crop.size, largest / maxZoom, largest);
  return {
    size,
    x: clamp(crop.x, 0, width - size),
    y: clamp(crop.y, 0, height - size),
  };
}

/** Recorte inicial centrado en una cara detectada (fracciones 0–1). */
export function cropAroundFace(
  face: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  maxZoom: number,
): Crop {
  const faceHeight = face.height * height;
  // La cara ocupa en torno al 40 % del encuadre: queda sitio para el
  // pelo y los hombros, que el modelo necesita para pegar bien el resultado.
  const size = faceHeight / 0.4;
  const centerX = (face.x + face.width / 2) * width;
  const centerY = (face.y + face.height / 2) * height;
  return clampCrop({ size, x: centerX - size / 2, y: centerY - size * 0.47 }, width, height, maxZoom);
}
