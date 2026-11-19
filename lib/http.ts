import "server-only";
import { MAX_BODY_BYTES } from "./config";
import { type ApiErrorBody, type ApiErrorCode, ERROR_MESSAGES } from "./errors";

/** Ninguna respuesta de la API debe quedarse en cachés intermedias. */
export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** Respuesta ya decidida, guardable y reutilizable (ver lib/attempts.ts). */
export interface Outcome {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export function errorOutcome(
  status: number,
  error: ApiErrorCode,
  extra: Partial<ApiErrorBody> = {},
  headers?: Record<string, string>,
): Outcome {
  return { status, body: { error, message: ERROR_MESSAGES[error], ...extra }, headers };
}

export function respond(outcome: Outcome): Response {
  return Response.json(outcome.body, {
    status: outcome.status,
    headers: { ...NO_STORE, ...outcome.headers },
  });
}

/**
 * ¿Viene la petición de nuestra propia página?
 *
 * Un formulario multipart se puede enviar desde cualquier web sin permiso
 * previo (CORS no lo impide), así que otra página podría gastar los intentos
 * y el dinero de la demo usando el navegador de sus visitantes. Los
 * navegadores marcan esas peticiones con `Sec-Fetch-Site`/`Origin`; las
 * herramientas que no son navegadores (curl, pruebas) no envían ninguna de
 * las dos y pasan a la validación normal.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";

  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Lee un formulario multipart sin aceptar nunca más de MAX_BODY_BYTES en
 * memoria, se declare o no el tamaño en `Content-Length`.
 */
export async function readLimitedForm(req: Request): Promise<FormData | "too_large" | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return null;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return "too_large";
  if (!req.body) return null;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return "too_large";
    }
    chunks.push(value);
  }

  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    return null;
  }
}
