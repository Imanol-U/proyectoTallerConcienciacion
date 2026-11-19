import "server-only";
import { RETENTION_SECONDS } from "./config";
import type { Outcome } from "./http";

/**
 * Reintentos seguros.
 *
 * Generar un vídeo tarda decenas de segundos. En ese rato la conexión se
 * puede cortar (el móvil pasa a segundo plano, el proxy de la plataforma
 * cierra conexiones inactivas…). El navegador reintenta entonces con la MISMA
 * cabecera `Idempotency-Key` y aquí se le devuelve el resultado del intento
 * original: no se vuelve a llamar al modelo, no se gasta otro intento del
 * visitante y no se paga dos veces.
 *
 * La clave es un identificador aleatorio que crea el navegador para cada
 * pulsación de "Generar vídeo". Solo se guarda la respuesta (nunca la foto) y
 * solo en memoria, 10 minutos como mucho.
 */

interface Attempt {
  outcome: Promise<Outcome>;
  timer: NodeJS.Timeout;
}

const MAX_ATTEMPTS = 2_000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

const globalStore = globalThis as typeof globalThis & {
  __eresTuAttempts?: Map<string, Attempt>;
};

function attempts(): Map<string, Attempt> {
  globalStore.__eresTuAttempts ??= new Map();
  return globalStore.__eresTuAttempts;
}

export function readIdempotencyKey(req: Request): string | null {
  const key = req.headers.get("idempotency-key");
  return key && KEY_PATTERN.test(key) ? key : null;
}

/** Resultado (quizá aún en curso) de un intento anterior con la misma clave. */
export function findAttempt(key: string): Promise<Outcome> | null {
  return attempts().get(key)?.outcome ?? null;
}

/**
 * Ejecuta `task` una sola vez por clave. Si ya hay un intento con esa clave,
 * devuelve el suyo sin ejecutar nada.
 */
export function rememberAttempt(key: string, task: () => Promise<Outcome>): Promise<Outcome> {
  const store = attempts();
  const existing = store.get(key);
  if (existing) return existing.outcome;
  if (store.size >= MAX_ATTEMPTS) return task();

  const outcome = task();
  const timer = setTimeout(() => store.delete(key), RETENTION_SECONDS * 1000);
  timer.unref();
  store.set(key, { outcome, timer });
  return outcome;
}

/** Olvida un intento (por ejemplo, cuando su vídeo ya se ha borrado). */
export function forgetAttempt(key: string): void {
  const store = attempts();
  const existing = store.get(key);
  if (!existing) return;
  clearTimeout(existing.timer);
  store.delete(key);
}

/** Solo para pruebas. */
export function resetAttemptsForTests(): void {
  for (const attempt of attempts().values()) clearTimeout(attempt.timer);
  attempts().clear();
}
