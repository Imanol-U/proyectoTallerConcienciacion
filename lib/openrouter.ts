import "server-only";
import type { AnimationId } from "./animations";
import { ANIMATIONS } from "./animations";
import { getConfig, MAX_VIDEO_SECONDS } from "./config";
import { PROMPTS } from "./prompts";

/**
 * Generación del vídeo con OpenRouter (por defecto, Grok Imagine Video 1.5 Lite).
 *
 * API asíncrona de OpenRouter, en tres pasos:
 *   1. POST /api/v1/videos            → { id, polling_url }
 *   2. GET  polling_url (repetido)    → { status, unsigned_urls?, error? }
 *   3. descarga del vídeo             → unsigned_urls[0] o /api/v1/videos/{id}/content
 *
 * La foto viaja incrustada en la petición, no se sube a ningún almacenamiento
 * aparte. En los gestos va como primer fotograma (el vídeo arranca en ella); en
 * las escenas va como referencia de identidad (`input_references`) a otro
 * modelo, para que el vídeo arranque ya en la escena.
 * La instrucción de texto es una de las fijas
 * de lib/prompts.ts. La duración pedida nunca pasa de MAX_VIDEO_SECONDS.
 *
 * OJO: escrito a partir de la documentación pública de OpenRouter y probado
 * con un servicio simulado, no contra el servicio real (ver README).
 */

export const OPENROUTER_BASE = "https://openrouter.ai";
const POLL_INTERVAL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

export type GenerationFailure =
  /** El modelo (o su filtro de contenido) rechaza la foto. */
  | "rejected"
  /** El servicio va lento, está saturado o no responde a tiempo. */
  | "busy"
  /** Problema nuestro: clave, saldo, configuración o respuesta inesperada. */
  | "unavailable";

export class GenerationError extends Error {
  readonly code: GenerationFailure;
  /** El servicio llegó a aceptar el trabajo, así que puede haber coste. */
  readonly accepted: boolean;
  /** El fallo se debe a la foto enviada, no a la infraestructura. */
  readonly inputFault: boolean;

  constructor(code: GenerationFailure, options: { accepted: boolean; inputFault: boolean; detail?: string }) {
    super(options.detail ?? code);
    this.name = "GenerationError";
    this.code = code;
    this.accepted = options.accepted;
    this.inputFault = options.inputFault;
  }
}

/** Texto de un error del servicio, sin URLs ni datos de la imagen, para el registro. */
function describe(body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  const message =
    typeof error === "string" ? error : typeof (error as { message?: unknown } | null)?.message === "string" ? (error as { message: string }).message : "";
  return message.replace(/data:[^\s"']+/g, "<datos>").replace(/https?:\/\/\S+/g, "<url>").slice(0, 200);
}

/** Traduce una respuesta HTTP de error a un motivo que la interfaz sabe explicar. */
/**
 * Un 400 también llega cuando NUESTRA petición tiene un parámetro que el
 * modelo no admite (p. ej. "Duration 12s exceeds the maximum allowed…").
 * Eso es un fallo de configuración, no de la foto del visitante.
 */
const PARAMETER_ERROR = /\b(duration|resolution|aspect[_ ]ratio|size|model|parameter|exceeds|not supported|unsupported|maximum allowed)\b/i;

export function failureFromStatus(status: number, accepted: boolean, detail = ""): GenerationError {
  if (status === 400 && PARAMETER_ERROR.test(detail)) {
    return new GenerationError("unavailable", { accepted, inputFault: false, detail: `HTTP ${status} ${detail}` });
  }
  if (status === 400 || status === 413 || status === 422) {
    // Petición rechazada por su contenido (moderación o imagen no válida).
    return new GenerationError("rejected", { accepted, inputFault: true, detail: `HTTP ${status} ${detail}` });
  }
  if (status === 408 || status === 429 || status >= 500) {
    return new GenerationError("busy", { accepted, inputFault: false, detail: `HTTP ${status} ${detail}` });
  }
  // 401/403 (clave), 402 (saldo), 404 (modelo)…
  return new GenerationError("unavailable", { accepted, inputFault: false, detail: `HTTP ${status} ${detail}` });
}

async function api(url: string, key: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    // Nada de esto debe quedar en la caché de datos de Next.js.
    cache: "no-store",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function download(url: string, key: string): Promise<Buffer> {
  const target = new URL(url, OPENROUTER_BASE);
  if (target.protocol !== "https:") throw new Error("URL de vídeo no válida");
  // La clave solo viaja a OpenRouter, nunca a otro dominio.
  const headers: Record<string, string> = target.origin === OPENROUTER_BASE ? { Authorization: `Bearer ${key}` } : {};
  const response = await fetch(target, { cache: "no-store", headers, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Descarga del vídeo: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0 || data.length > MAX_VIDEO_BYTES) throw new Error("El vídeo generado no tiene un tamaño válido");
  return data;
}

export interface GeneratedVideo {
  /** El mp4 tal cual lo devuelve el modelo: SIN marca de agua. */
  video: Buffer;
}

/**
 * Anima la foto con el gesto elegido.
 * `photo` debe ser ya un JPEG validado y sin metadatos (ver lib/jpeg.ts).
 */
export async function generateFakeVideo(photo: Buffer, animation: AnimationId): Promise<GeneratedVideo> {
  const config = getConfig();
  const key = config.openRouterKey;
  if (!key) {
    console.error("[modelo] unavailable: OPENROUTER_API_KEY no está definida");
    throw new GenerationError("unavailable", { accepted: false, inputFault: false });
  }

  const deadline = Date.now() + config.generationTimeoutMs;
  let accepted = false;

  try {
    const info = ANIMATIONS[animation];
    const image = { type: "image_url", image_url: { url: `data:image/jpeg;base64,${photo.toString("base64")}` } };
    const submit = await api(`${OPENROUTER_BASE}/api/v1/videos`, key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: info.photoUse === "reference" ? config.sceneVideoModel : config.videoModel,
        prompt: PROMPTS[animation],
        // Nunca más de MAX_VIDEO_SECONDS, se configure lo que se configure.
        duration: Math.min(info.seconds, MAX_VIDEO_SECONDS),
        resolution: "480p",
        aspect_ratio: "1:1",
        ...(info.photoUse === "reference"
          ? { input_references: [image] }
          : { frame_images: [{ ...image, frame_type: "first_frame" }] }),
      }),
    });
    const job = (await submit.json().catch(() => null)) as { id?: unknown; polling_url?: unknown } | null;
    if (!submit.ok) throw failureFromStatus(submit.status, false, describe(job));
    if (typeof job?.id !== "string") {
      throw new GenerationError("unavailable", { accepted: false, inputFault: false, detail: "respuesta sin id" });
    }
    accepted = true;

    const pollUrl = new URL(
      typeof job.polling_url === "string" ? job.polling_url : `/api/v1/videos/${encodeURIComponent(job.id)}`,
      OPENROUTER_BASE,
    );
    if (pollUrl.origin !== OPENROUTER_BASE) {
      throw new GenerationError("unavailable", { accepted, inputFault: false, detail: "polling_url ajena" });
    }

    for (;;) {
      if (Date.now() >= deadline) {
        throw new GenerationError("busy", { accepted, inputFault: false, detail: "tiempo agotado" });
      }
      await sleep(POLL_INTERVAL_MS);
      const poll = await api(pollUrl.href, key);
      const state = (await poll.json().catch(() => null)) as
        | { status?: unknown; unsigned_urls?: unknown; error?: unknown }
        | null;
      if (!poll.ok) {
        // Un tropiezo al consultar no invalida el trabajo: se sigue esperando.
        if (poll.status === 429 || poll.status >= 500) continue;
        throw failureFromStatus(poll.status, accepted, describe(state));
      }

      const status = state?.status;
      if (status === "completed") {
        const urls = Array.isArray(state?.unsigned_urls) ? state.unsigned_urls : [];
        const url = typeof urls[0] === "string" ? urls[0] : `/api/v1/videos/${encodeURIComponent(job.id)}/content?index=0`;
        return { video: await download(url, key) };
      }
      if (status === "failed") {
        // Lo habitual es que el filtro de contenido haya rechazado la imagen.
        throw new GenerationError("rejected", { accepted, inputFault: true, detail: `failed: ${describe(state)}` });
      }
      if (status === "cancelled" || status === "expired") {
        throw new GenerationError("busy", { accepted, inputFault: false, detail: String(status) });
      }
      // pending / in_progress: seguir esperando.
    }
  } catch (error) {
    const failure =
      error instanceof GenerationError
        ? error
        : // Tiempo agotado, fallo de red o descarga fallida.
          new GenerationError("busy", {
            accepted,
            inputFault: false,
            detail: error instanceof Error ? `${error.name}: ${error.message.replace(/https?:\/\/\S+/g, "<url>").slice(0, 200)}` : "error",
          });
    console.error(`[modelo] ${failure.code}: ${failure.message}`);
    throw failure;
  }
}
