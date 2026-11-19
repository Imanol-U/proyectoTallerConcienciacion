import "server-only";
import { isIP } from "node:net";
import { getConfig } from "./config";

/**
 * Obtiene la IP del visitante para el límite de abuso.
 *
 * `X-Forwarded-For` lo puede escribir el propio cliente, así que NO vale coger
 * el primer valor sin más: bastaría con inventarse esa cabecera en cada
 * petición para saltarse el límite por IP. Orden de confianza:
 *
 *  1. `CLIENT_IP_HEADER`, si está definida (p. ej. `cf-connecting-ip` cuando
 *     hay un CDN delante).
 *  2. La cabecera que fija el proxy de la plataforma: `Fly-Client-IP` en
 *     Fly.io y `X-Real-IP` en Railway (se detectan por sus variables de entorno).
 *  3. El ÚLTIMO valor de `X-Forwarded-For`, que es el que añade el proxy más
 *     cercano a nosotros.
 *
 * Si no hay forma de saberla, todas esas peticiones comparten el cubo
 * "unknown": falla hacia el lado restrictivo.
 */

export const UNKNOWN_IP = "unknown";

function platformHeader(): string | undefined {
  if (process.env.FLY_APP_NAME) return "fly-client-ip";
  if (process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID) {
    return "x-real-ip";
  }
  return undefined;
}

function expandIpv6(ip: string): number[] | null {
  let text = ip;
  // Sufijo IPv4 incrustado (p. ej. 64:ff9b::192.0.2.1).
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const bytes = tail.split(".").map(Number);
    if (bytes.length !== 4 || bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
      return null;
    }
    const high = ((bytes[0] << 8) | bytes[1]).toString(16);
    const low = ((bytes[2] << 8) | bytes[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const numbers = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return numbers.some(Number.isNaN) ? null : numbers;
}

/**
 * Normaliza una IP. En IPv6 se agrupa por prefijo /64: un mismo usuario
 * dispone de millones de direcciones dentro de su /64 y, si no, el límite por
 * IP sería papel mojado.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim().toLowerCase();
  if (ip.length === 0 || ip.length > 64) return null;

  const bracketed = /^\[([0-9a-f:.]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];

  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  if (v4WithPort) ip = v4WithPort[1];

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) ip = mapped[1];

  const version = isIP(ip);
  if (version === 4) return ip;
  if (version === 6) {
    const groups = expandIpv6(ip);
    if (!groups) return null;
    return `${groups
      .slice(0, 4)
      .map((g) => g.toString(16))
      .join(":")}::/64`;
  }
  return null;
}

function fromHeader(req: Request, name: string): string | null {
  const value = req.headers.get(name);
  if (!value) return null;
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return normalizeIp(parts[parts.length - 1]);
}

export function getClientIp(req: Request): string {
  const trusted = getConfig().clientIpHeader ?? platformHeader();
  if (trusted) return fromHeader(req, trusted) ?? UNKNOWN_IP;
  return fromHeader(req, "x-forwarded-for") ?? fromHeader(req, "x-real-ip") ?? UNKNOWN_IP;
}
