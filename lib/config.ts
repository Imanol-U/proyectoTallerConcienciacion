import "server-only";

/**
 * Configuración del servidor.
 *
 * Todo se lee de variables de entorno EN CADA LLAMADA (no al cargar el módulo)
 * para que una misma imagen Docker sirva en cualquier entorno y para que el
 * interruptor DEMO_ENABLED no dependa de cuándo se compiló la aplicación.
 */

/** Tope de conservación de cualquier dato del visitante: 10 minutos. */
export const RETENTION_SECONDS = 600;

/** Duración máxima de un vídeo generado, en segundos. */
export const MAX_VIDEO_SECONDS = 15;

/** Modelo de vídeo por defecto en OpenRouter. */
export const DEFAULT_VIDEO_MODEL = "x-ai/grok-imagine-video-1.5-lite";

/**
 * Modelo para las escenas, que usan la foto como referencia de identidad y no
 * como primer fotograma (el 1.5 Lite solo admite primer fotograma).
 */
export const DEFAULT_SCENE_VIDEO_MODEL = "x-ai/grok-imagine-video";

/** La foto llega siempre como JPEG cuadrado de este lado (px). */
export const PHOTO_SIZE = 512;

/** Tamaño máximo de la foto que acepta el servidor (bytes). */
export const MAX_PHOTO_BYTES = 2_000_000;

/** Margen para los campos de texto y las cabeceras del multipart. */
export const MAX_BODY_BYTES = MAX_PHOTO_BYTES + 64 * 1024;

const warned = new Set<string>();

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[config] ${message}`);
}

function intFromEnv(
  name: string,
  fallback: number,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    warnOnce(
      name,
      `${name}="${raw}" no es válido (entero entre ${min} y ${max}); se usa ${fallback}.`,
    );
    return fallback;
  }
  return value;
}

function textFromEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

export interface AppConfig {
  /** Interruptor de apagado. Solo el valor exacto "true" enciende la demo. */
  demoEnabled: boolean;
  /** `false` = solo cámara. Solo el valor exacto "true" permite subir fotos. */
  uploadEnabled: boolean;
  maxPerIpPerDay: number;
  maxGlobalPerDay: number;
  /** Segundos que vive el vídeo marcado. Nunca más de RETENTION_SECONDS. */
  videoTtlSeconds: number;
  /** Tiempo máximo que esperamos al modelo antes de rendirnos. */
  generationTimeoutMs: number;
  /** Clave de OpenRouter. Solo en el servidor. */
  openRouterKey: string | undefined;
  /** Identificador del modelo de vídeo en OpenRouter. */
  videoModel: string;
  /** Modelo de las escenas (foto como referencia, no como primer fotograma). */
  sceneVideoModel: string;
  /** Cabecera de la que fiarse para la IP del cliente (ver lib/clientIp.ts). */
  clientIpHeader: string | undefined;
  /** Coste medido por vídeo, en euros (opcional; solo para mostrarlo). */
  costPerVideoEur: number | undefined;
  orgName: string | undefined;
  contactEmail: string | undefined;
  ffmpegPath: string;
  watermarkFontPath: string | undefined;
}

export function getConfig(): AppConfig {
  const cost = Number(process.env.COST_PER_VIDEO_EUR);
  return {
    demoEnabled: process.env.DEMO_ENABLED === "true",
    uploadEnabled: process.env.UPLOAD_ENABLED === "true",
    maxPerIpPerDay: intFromEnv("MAX_PER_IP_PER_DAY", 3),
    maxGlobalPerDay: intFromEnv("MAX_GLOBAL_PER_DAY", 200),
    videoTtlSeconds: intFromEnv("VIDEO_TTL_SECONDS", RETENTION_SECONDS, {
      min: 1,
      max: RETENTION_SECONDS,
    }),
    generationTimeoutMs:
      intFromEnv("GENERATION_TIMEOUT_SECONDS", 280, { min: 5, max: 280 }) * 1000,
    openRouterKey: textFromEnv("OPENROUTER_API_KEY"),
    videoModel: textFromEnv("OPENROUTER_VIDEO_MODEL") ?? DEFAULT_VIDEO_MODEL,
    sceneVideoModel: textFromEnv("OPENROUTER_SCENE_VIDEO_MODEL") ?? DEFAULT_SCENE_VIDEO_MODEL,
    clientIpHeader: textFromEnv("CLIENT_IP_HEADER")?.toLowerCase(),
    costPerVideoEur: Number.isFinite(cost) && cost > 0 ? cost : undefined,
    orgName: textFromEnv("ORG_NAME"),
    contactEmail: textFromEnv("CONTACT_EMAIL"),
    ffmpegPath: textFromEnv("FFMPEG_PATH") ?? "ffmpeg",
    watermarkFontPath: textFromEnv("WATERMARK_FONT_PATH"),
  };
}
