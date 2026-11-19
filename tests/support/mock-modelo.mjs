/**
 * OpenRouter simulado para las pruebas de navegador y para `npm run demo:simulada`.
 *
 * Se precarga en el servidor de Next.js con `node --import` y sustituye
 * `fetch` SOLO para openrouter.ai. El código de la aplicación no sabe que
 * existe. Responde con el mismo protocolo que la API de vídeo de OpenRouter:
 *
 *   POST /api/v1/videos                 → { id, polling_url }
 *   GET  /api/v1/videos/{id}            → pending → completed (+ unsigned_urls) | failed
 *   GET  /api/v1/videos/{id}/content    → vídeo SIN marca y CON audio
 *
 * Control e inspección por ficheros en MOCK_MODELO_DIR: `control.json` (cómo
 * comportarse) y `calls.jsonl` (qué ha llegado), más la foto recibida. Con
 * MOCK_MODELO_RECORD=false no se anota nada ni se guarda ninguna foto.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.env.MOCK_MODELO_DIR;
if (!dir) throw new Error("mock-modelo: falta MOCK_MODELO_DIR");
const recording = process.env.MOCK_MODELO_RECORD !== "false";
if (recording) mkdirSync(path.join(dir, "uploads"), { recursive: true });

const realFetch = globalThis.fetch;
const jobs = new Map(); // id → { submittedAt }

function control() {
  try {
    return JSON.parse(readFileSync(path.join(dir, "control.json"), "utf8"));
  } catch {
    return {};
  }
}

function record(entry) {
  if (recording) appendFileSync(path.join(dir, "calls.jsonl"), `${JSON.stringify(entry)}\n`);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** @param {URL} url @param {Request} request */
async function handle(url, request) {
  const method = request.method.toUpperCase();
  const authorized = request.headers.get("authorization") === `Bearer ${process.env.OPENROUTER_API_KEY}`;
  const { mode = "ok", delayMs = 300 } = control();

  if (url.pathname === "/api/v1/videos" && method === "POST") {
    if (!authorized) return json({ error: { message: "No auth credentials found", code: 401 } }, 401);
    if (mode === "down") return json({ error: { message: "Service Unavailable", code: 503 } }, 503);
    const body = await request.json();
    const id = randomUUID();
    const frame = body.frame_images?.[0];
    const dataUrl = (frame ?? body.input_references?.[0])?.image_url?.url ?? "";
    let saved = null;
    if (recording && dataUrl.startsWith("data:image/jpeg;base64,")) {
      saved = path.join(dir, "uploads", `${id}.jpg`);
      writeFileSync(saved, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    }
    jobs.set(id, { submittedAt: Date.now() });
    record({
      call: "submit",
      authorized,
      id,
      model: body.model,
      prompt: body.prompt,
      duration: body.duration,
      resolution: body.resolution,
      aspectRatio: body.aspect_ratio,
      frameType: frame?.frame_type ?? null,
      frames: body.frame_images?.length ?? 0,
      references: body.input_references?.length ?? 0,
      otherKeys: Object.keys(body).filter((k) => !["model", "prompt", "duration", "resolution", "aspect_ratio", "frame_images", "input_references"].includes(k)),
      saved,
    });
    return json({ id, polling_url: `/api/v1/videos/${id}`, status: "pending" });
  }

  const match = /^\/api\/v1\/videos\/([^/]+)(\/content)?$/.exec(url.pathname);
  if (match && method === "GET") {
    const [, id, content] = match;
    const job = jobs.get(id);
    if (!job) return json({ error: { message: "Not found", code: 404 } }, 404);
    if (content) {
      record({ call: "download", id });
      return new Response(readFileSync(path.join(dir, "sin-marca.mp4")), { headers: { "content-type": "video/mp4" } });
    }
    if (Date.now() - job.submittedAt < delayMs) return json({ id, status: "in_progress", polling_url: `/api/v1/videos/${id}` });
    if (mode === "rejected") {
      return json({ id, status: "failed", error: "Content moderation: the input image was rejected https://openrouter.ai/x" });
    }
    return json({
      id,
      status: "completed",
      unsigned_urls: [`https://openrouter.ai/api/v1/videos/${id}/content?index=0`],
      usage: { cost: 0.1 },
    });
  }

  record({ call: "unexpected", method, url: url.href });
  return json({ error: { message: `mock-modelo: petición no prevista: ${method} ${url.href}` } }, 500);
}

globalThis.fetch = async function mockedFetch(input, init) {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let url;
  try {
    url = new URL(href);
  } catch {
    return realFetch(input, init);
  }
  if (url.hostname !== "openrouter.ai") return realFetch(input, init);
  return handle(url, new Request(input, init));
};
