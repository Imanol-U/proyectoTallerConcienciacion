import { type AnimationId, isAnimationId } from "@/lib/animations";
import { findAttempt, forgetAttempt, readIdempotencyKey, rememberAttempt } from "@/lib/attempts";
import { getClientIp } from "@/lib/clientIp";
import { getConfig, MAX_PHOTO_BYTES, PHOTO_SIZE } from "@/lib/config";
import { limitMessage } from "@/lib/errors";
import { GenerationError, generateFakeVideo } from "@/lib/openrouter";
import { errorOutcome, isSameOrigin, type Outcome, readLimitedForm, respond } from "@/lib/http";
import { sanitizeJpeg } from "@/lib/jpeg";
import { consume, getDailyCount, type LimitScope, peekLimits, secondsUntilReset } from "@/lib/rateLimit";
import { getTempTtl, saveTemp } from "@/lib/tempStore";
import { burnWatermark } from "@/lib/watermark";

/**
 * POST /api/generate — foto + animación → id del vídeo (ya marcado).
 *
 * El navegador nunca recibe la URL original del servicio de IA: solo este `id`, que se
 * canjea en /api/video/{id} por la versión con marca de agua.
 *
 * No se exporta `runtime = "nodejs"`: ya es el entorno por defecto y, con
 * Cache Components activado, Next.js no admite esa exportación.
 */
export const maxDuration = 300;

function limitOutcome(scope: LimitScope): Outcome {
  return errorOutcome(
    429,
    "limit",
    { scope, message: limitMessage(scope, getConfig().maxPerIpPerDay) },
    { "Retry-After": String(secondsUntilReset()) },
  );
}

const FAILURE_STATUS = { rejected: 422, busy: 503, unavailable: 503 } as const;

async function generate(ip: string, photo: Buffer, animation: AnimationId): Promise<Outcome> {
  // Comprobación y consumo atómicos, justo antes de gastar dinero.
  const slot = consume(ip);
  if (!slot.ok) return limitOutcome(slot.scope);

  const startedAt = Date.now();
  const seconds = () => ((Date.now() - startedAt) / 1000).toFixed(1);

  try {
    const { video } = await generateFakeVideo(photo, animation);
    // Único camino hacia el almacén: si la marca falla, no se guarda nada.
    const marked = await burnWatermark(video);
    const id = await saveTemp(marked);

    // Registro anónimo: ni IP, ni imagen, ni identificador del vídeo.
    console.info(
      `[generate] ok animacion=${animation} segundos=${seconds()} videos_hoy=${getDailyCount().videos}`,
    );
    return {
      status: 200,
      body: { id, ttlSeconds: getConfig().videoTtlSeconds, remaining: slot.remaining },
    };
  } catch (error) {
    if (error instanceof GenerationError) {
      // el servicio no llegó a aceptar el trabajo → no hubo coste: se devuelve el hueco global.
      if (!error.accepted) slot.refundGlobal();
      // El fallo no es de la foto → el visitante no pierde su intento.
      if (!error.inputFault) slot.refundIp();
      console.warn(`[generate] fallo=${error.code} animacion=${animation} segundos=${seconds()}`);
      return errorOutcome(FAILURE_STATUS[error.code], error.code);
    }

    // Fallo nuestro después de generar (marca de agua o disco).
    slot.refundIp();
    console.error(
      `[generate] fallo=internal animacion=${animation} segundos=${seconds()}:`,
      error instanceof Error ? error.message : error,
    );
    return errorOutcome(500, "internal");
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!getConfig().demoEnabled) return respond(errorOutcome(503, "demo_off"));
  if (!isSameOrigin(req)) return respond(errorOutcome(403, "forbidden"));

  // Reintento de una petición cuya respuesta se perdió por el camino.
  const idempotencyKey = readIdempotencyKey(req);
  if (idempotencyKey) {
    const previous = findAttempt(idempotencyKey);
    if (previous) {
      const outcome = await previous;
      const id = outcome.body.id;
      if (typeof id !== "string" || getTempTtl(id) !== null) return respond(outcome);
      // Su vídeo ya se borró: se trata como una petición nueva.
      forgetAttempt(idempotencyKey);
    }
  }

  const ip = getClientIp(req);
  const blocked = peekLimits(ip);
  if (blocked) return respond(limitOutcome(blocked));

  const form = await readLimitedForm(req);
  if (form === "too_large") return respond(errorOutcome(400, "photo"));
  if (!form) return respond(errorOutcome(400, "bad_request"));

  const consent = form.get("consent") === "true";
  const animation = form.get("animation");
  const photo = form.get("photo");

  if (!consent) return respond(errorOutcome(400, "consent"));
  if (!isAnimationId(animation)) return respond(errorOutcome(400, "animation"));
  if (!(photo instanceof File) || photo.type !== "image/jpeg" || photo.size > MAX_PHOTO_BYTES) {
    return respond(errorOutcome(400, "photo"));
  }

  // No basta con el tipo declarado: se comprueban los bytes y las medidas, y
  // se reconstruye el JPEG sin metadatos.
  const jpeg = sanitizeJpeg(Buffer.from(await photo.arrayBuffer()));
  if (!jpeg.ok || jpeg.width !== PHOTO_SIZE || jpeg.height !== PHOTO_SIZE) {
    return respond(errorOutcome(400, "photo"));
  }

  const task = () => generate(ip, jpeg.data, animation);
  const outcome = idempotencyKey ? rememberAttempt(idempotencyKey, task) : task();
  return respond(await outcome);
}
