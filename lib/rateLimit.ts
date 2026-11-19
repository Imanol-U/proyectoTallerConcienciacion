import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { getConfig } from "./config";

/**
 * Contador en memoria por IP y global, por día natural (UTC).
 *
 * - No se guarda la IP: solo un HMAC con una clave aleatoria que vive en
 *   memoria y se renueva cada día, de modo que los contadores no sirven para
 *   reconocer a nadie de un día para otro ni salen nunca del proceso.
 * - Al estar en memoria, los contadores se pierden si el proceso se reinicia y
 *   no se comparten entre instancias: la demo debe correr en UNA sola
 *   instancia siempre encendida. El límite de crédito de la clave en OpenRouter es la
 *   última red de seguridad.
 */

interface RateLimitState {
  day: string;
  secret: Buffer;
  global: number;
  perIp: Map<string, number>;
}

const globalStore = globalThis as typeof globalThis & {
  __eresTuRateLimit?: RateLimitState;
};

function today(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function freshState(now: number): RateLimitState {
  return { day: today(now), secret: randomBytes(32), global: 0, perIp: new Map() };
}

function getState(now = Date.now()): RateLimitState {
  const current = globalStore.__eresTuRateLimit;
  if (!current || current.day !== today(now)) {
    const next = freshState(now);
    globalStore.__eresTuRateLimit = next;
    return next;
  }
  return current;
}

function keyFor(state: RateLimitState, ip: string): string {
  return createHmac("sha256", state.secret).update(ip).digest("base64url");
}

export type LimitScope = "ip" | "global";

export type LimitDecision =
  | {
      ok: true;
      /** Intentos que le quedan hoy a esta IP tras consumir este. */
      remaining: number;
      /** Devuelve el intento a la IP (el fallo no fue culpa del visitante). */
      refundIp(): void;
      /** Devuelve también el hueco global (el servicio nunca llegó a aceptar el trabajo). */
      refundGlobal(): void;
    }
  | { ok: false; scope: LimitScope };

function blockedScope(state: RateLimitState, key: string): LimitScope | null {
  const { maxPerIpPerDay, maxGlobalPerDay } = getConfig();
  if (state.global >= maxGlobalPerDay) return "global";
  if ((state.perIp.get(key) ?? 0) >= maxPerIpPerDay) return "ip";
  return null;
}

/**
 * Consulta sin consumir: ¿puede esta IP generar otro vídeo hoy?
 * Sirve para rechazar pronto (429) antes de leer el cuerpo de la petición.
 */
export function checkLimits(ip: string): boolean {
  return peekLimits(ip) === null;
}

/** Igual que `checkLimits`, pero dice qué límite se ha alcanzado. */
export function peekLimits(ip: string): LimitScope | null {
  const state = getState();
  return blockedScope(state, keyFor(state, ip));
}

/**
 * Comprueba y consume un intento de forma atómica (JavaScript no cede el
 * control entre la comprobación y el incremento).
 */
export function consume(ip: string): LimitDecision {
  const state = getState();
  const key = keyFor(state, ip);
  const scope = blockedScope(state, key);
  if (scope) return { ok: false, scope };

  const used = (state.perIp.get(key) ?? 0) + 1;
  state.perIp.set(key, used);
  state.global += 1;

  let ipRefunded = false;
  let globalRefunded = false;
  // Las devoluciones solo valen si seguimos en el mismo día (mismo estado).
  const sameDay = () => globalStore.__eresTuRateLimit === state;

  return {
    ok: true,
    remaining: Math.max(0, getConfig().maxPerIpPerDay - used),
    refundIp() {
      if (ipRefunded || !sameDay()) return;
      ipRefunded = true;
      const count = state.perIp.get(key) ?? 0;
      if (count <= 1) state.perIp.delete(key);
      else state.perIp.set(key, count - 1);
    },
    refundGlobal() {
      if (globalRefunded || !sameDay()) return;
      globalRefunded = true;
      state.global = Math.max(0, state.global - 1);
    },
  };
}

/** Segundos hasta que se reinician los contadores (medianoche UTC). */
export function secondsUntilReset(now = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
}

/** Contador anónimo: número de vídeos de hoy. Es lo único que se registra. */
export function getDailyCount(): { day: string; videos: number } {
  const state = getState();
  return { day: state.day, videos: state.global };
}

/** Solo para pruebas. */
export function resetRateLimitForTests(): void {
  delete globalStore.__eresTuRateLimit;
}
