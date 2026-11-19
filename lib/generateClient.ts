/**
 * Cliente de la API en el navegador: pedir el vídeo y borrarlo.
 */

import type { AnimationId } from "./animations";
import { type ApiErrorCode, ERROR_MESSAGES, isApiErrorBody } from "./errors";

export interface GeneratedVideo {
  id: string;
  /** Segundos hasta que el servidor borra el vídeo. */
  ttlSeconds: number;
  /** Intentos que le quedan hoy a esta conexión. */
  remaining: number;
}

export type FailureCode = ApiErrorCode | "network";

export class GenerateFailure extends Error {
  readonly code: FailureCode;
  readonly scope?: "ip" | "global";

  constructor(code: FailureCode, message: string, scope?: "ip" | "global") {
    super(message);
    this.name = "GenerateFailure";
    this.code = code;
    this.scope = scope;
  }
}

const NETWORK_MESSAGE =
  "No hemos podido conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";

/** Tiempo total que seguimos reintentando una misma petición. */
const TOTAL_BUDGET_MS = 330_000;
/** Tiempo máximo de espera de cada intento. */
const ATTEMPT_TIMEOUT_MS = 300_000;

function randomKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // `randomUUID` solo existe en contextos seguros (https o localhost).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Si la pestaña está en segundo plano, espera a que vuelva (hasta `maxMs`). */
function whenVisible(maxMs: number): Promise<void> {
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener("visibilitychange", onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (document.visibilityState === "visible") done();
    };
    const timer = setTimeout(done, maxMs);
    document.addEventListener("visibilitychange", onChange);
  });
}

/**
 * Pide el vídeo. La generación tarda decenas de segundos y la conexión puede
 * cortarse por el camino (móvil en segundo plano, cobertura, proxies). Por eso
 * cada pulsación lleva una clave única: si hay que reintentar, el servidor
 * reconoce la clave y devuelve el resultado del primer intento, sin generar
 * otro vídeo ni gastar otro intento.
 */
export async function requestVideo(
  photo: Blob,
  animation: AnimationId,
  signal?: AbortSignal,
): Promise<GeneratedVideo> {
  const key = randomKey();
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (let attempt = 0; ; attempt += 1) {
    const form = new FormData();
    form.set("photo", photo, "foto.jpg");
    form.set("animation", animation);
    form.set("consent", "true");

    // Un controlador propio por intento: se aborta al agotarse su tiempo o si
    // lo pide quien llama. (Sin AbortSignal.any/timeout, que los navegadores
    // de hace un par de años no tienen.)
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    const timer = setTimeout(abortAttempt, ATTEMPT_TIMEOUT_MS);
    signal?.addEventListener("abort", abortAttempt, { once: true });
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body: form,
        headers: { "Idempotency-Key": key },
        cache: "no-store",
        signal: attemptController.signal,
      });
      const data: unknown = await response.json().catch(() => null);

      if (response.ok && typeof (data as GeneratedVideo | null)?.id === "string") {
        return data as GeneratedVideo;
      }
      if (isApiErrorBody(data)) {
        throw new GenerateFailure(data.error, data.message || ERROR_MESSAGES[data.error], data.scope);
      }
      // Respuesta que no es de nuestra API (página de error de un proxy): se reintenta.
    } catch (error) {
      if (error instanceof GenerateFailure) throw error;
      if (signal?.aborted) throw error;
      // Error de red o intento agotado: se reintenta con la misma clave.
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortAttempt);
    }

    const wait = Math.min(2_000 + attempt * 2_000, 8_000);
    if (Date.now() + wait >= deadline) throw new GenerateFailure("network", NETWORK_MESSAGE);
    await sleep(wait, signal);
    await whenVisible(Math.max(0, deadline - Date.now()));
  }
}

/**
 * Borra el vídeo del servidor. `keepalive` permite que la petición termine
 * aunque la página se esté cerrando.
 */
export async function deleteVideo(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/video/${encodeURIComponent(id)}`, {
      method: "DELETE",
      keepalive: true,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function videoUrl(id: string): string {
  return `/api/video/${encodeURIComponent(id)}`;
}
