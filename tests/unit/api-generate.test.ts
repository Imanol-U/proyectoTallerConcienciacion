import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIF_MARKER_TEXT, grayFrame, makeJpeg, makeSampleVideo, meanLuma, probe, withFakeExif } from "../support/media";

/**
 * Pruebas de la API de punta a punta, con el modelo simulado:
 * foto → (OpenRouter simulado) → marca de agua real con ffmpeg → almacén → /api/video/{id}.
 */

import { POST } from "@/app/api/generate/route";
import { GET as GET_VIDEO } from "@/app/api/video/[id]/route";
import { resetAttemptsForTests } from "@/lib/attempts";
import { resetRateLimitForTests } from "@/lib/rateLimit";
import { clearTempForTests, countTemp } from "@/lib/tempStore";

const API = "https://openrouter.ai/api/v1/videos";
const JOB = "job-123";
const VIDEO_URL = `${API}/${JOB}/content?index=0`;

/** OpenRouter simulado a nivel de `fetch`. Cada prueba puede cambiar sus respuestas. */
const model = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpo JSON arbitrario en las pruebas
  submit: vi.fn<(body: Record<string, any>, headers: Headers) => Response | Promise<Response>>(),
  poll: vi.fn<() => Response | Promise<Response>>(),
  download: vi.fn<(headers: Headers) => Response | Promise<Response>>(),
};
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let jpeg: Buffer;
let unmarkedVideo: Buffer;
let fetchMock: ReturnType<typeof vi.fn>;
let ipCounter = 0;

function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

interface FormOptions {
  photo?: Blob | string | null;
  photoName?: string;
  animation?: string | null;
  consent?: string | null;
  ip?: string;
  headers?: Record<string, string>;
}

function jpegBlob(bytes: Buffer = jpeg, type = "image/jpeg"): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

function buildRequest(options: FormOptions = {}): Request {
  const form = new FormData();
  const photo = options.photo === undefined ? jpegBlob() : options.photo;
  if (photo instanceof Blob) form.set("photo", photo, options.photoName ?? "foto.jpg");
  else if (typeof photo === "string") form.set("photo", photo);
  const animation = options.animation === undefined ? "saludo" : options.animation;
  if (animation !== null) form.set("animation", animation);
  const consent = options.consent === undefined ? "true" : options.consent;
  if (consent !== null) form.set("consent", consent);

  return new Request("http://localhost/api/generate", {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": options.ip ?? nextIp(), ...options.headers },
  });
}

async function post(options: FormOptions = {}) {
  const response = await POST(buildRequest(options));
  return { response, status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function fetchVideo(id: string, headers: Record<string, string> = {}) {
  return GET_VIDEO(new Request(`http://localhost/api/video/${id}`, { headers }), {
    params: Promise.resolve({ id }),
  });
}

beforeAll(async () => {
  jpeg = await makeJpeg();
  unmarkedVideo = await makeSampleVideo({ seconds: 2, gray: 128 });
});

beforeEach(async () => {
  process.env.DEMO_ENABLED = "true";
  process.env.UPLOAD_ENABLED = "true";
  process.env.OPENROUTER_API_KEY = "clave-de-prueba";
  process.env.MAX_PER_IP_PER_DAY = "3";
  process.env.MAX_GLOBAL_PER_DAY = "200";
  delete process.env.VIDEO_TTL_SECONDS;
  delete process.env.WATERMARK_FONT_PATH;
  delete process.env.CLIENT_IP_HEADER;

  resetRateLimitForTests();
  resetAttemptsForTests();
  await clearTempForTests();

  model.submit.mockReset().mockImplementation(() => jsonResponse({ id: JOB, polling_url: `/api/v1/videos/${JOB}` }));
  model.poll.mockReset().mockImplementation(() => jsonResponse({ id: JOB, status: "completed", unsigned_urls: [VIDEO_URL] }));
  model.download
    .mockReset()
    .mockImplementation(() => new Response(new Uint8Array(unmarkedVideo), { headers: { "content-type": "video/mp4" } }));

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url === API && init?.method === "POST") return model.submit(JSON.parse(String(init.body)), headers);
    if (url === `${API}/${JOB}`) return model.poll();
    if (url === VIDEO_URL) return model.download(headers);
    throw new Error(`petición de red inesperada en la prueba: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/generate — camino feliz", () => {
  it("devuelve solo un id; el vídeo servido lleva marca de agua y no tiene audio", async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["id", "remaining", "ttlSeconds"]);
    expect(body).toMatchObject({ ttlSeconds: 600, remaining: 2 });

    // En la respuesta no aparece ninguna URL del servicio de IA.
    expect(JSON.stringify(body)).not.toMatch(/openrouter|https?:/);

    const video = await fetchVideo(String(body.id));
    expect(video.status).toBe(200);
    expect(video.headers.get("content-type")).toBe("video/mp4");
    expect(video.headers.get("cache-control")).toContain("no-store");
    expect(video.headers.get("content-disposition")).toBe("inline");
    for (const [name, value] of video.headers) expect(`${name}: ${value}`).not.toMatch(/openrouter/);

    const served = Buffer.from(await video.arrayBuffer());
    expect(served.equals(unmarkedVideo)).toBe(false);

    const info = await probe(served);
    expect(info.streams.map((s) => s.codec_type)).toEqual(["video"]);
    expect(info.format.tags?.comment).toBe("AI-generated. Educational deepfake demo.");

    // La franja inferior de la marca oscurece el gris original.
    const frame = await grayFrame(served, 1);
    const plain = meanLuma(frame, 8, 8, 60, 60);
    const band = meanLuma(frame, 4, Math.round(frame.height * 0.92), 44, frame.height - 4);
    expect(band).toBeLessThan(plain * 0.5);
  });

  it("pide a OpenRouter el modelo elegido, como mucho 5 segundos y con la instrucción fija del servidor", async () => {
    await post({ animation: "guino" });

    expect(model.submit).toHaveBeenCalledTimes(1);
    const [body, headers] = model.submit.mock.calls[0];
    expect(headers.get("authorization")).toBe("Bearer clave-de-prueba");
    expect(body.model).toBe("x-ai/grok-imagine-video-1.5-lite");
    expect(body.duration).toBe(5);
    expect(body.resolution).toBe("480p");
    expect(body.aspect_ratio).toBe("1:1");
    expect(body.prompt).toMatch(/winks/);
    expect(body.prompt).toMatch(/does not speak/);
    expect(Object.keys(body).sort()).toEqual(["aspect_ratio", "duration", "frame_images", "model", "prompt", "resolution"]);
    expect(body.frame_images).toHaveLength(1);
    expect(body.frame_images[0].frame_type).toBe("first_frame");
    expect(body.frame_images[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("ninguna animación pide más de 15 segundos", async () => {
    for (const animation of ["saludo", "sonrisa", "sorpresa", "guino", "teletransporte", "escenario"]) await post({ animation });
    const durations = model.submit.mock.calls.map(([body]) => body.duration);
    expect(durations).toEqual([4, 4, 4, 5, 10, 10]);
    expect(Math.max(...durations)).toBeLessThanOrEqual(15);
  });

  it("si el modelo devuelve un vídeo más largo, se corta a 15 segundos", async () => {
    const long = await makeSampleVideo({ seconds: 18, gray: 128 });
    model.download.mockImplementation(() => new Response(new Uint8Array(long)));
    const { body } = await post();
    const served = Buffer.from(await (await fetchVideo(String(body.id))).arrayBuffer());
    expect(Number((await probe(served)).format.duration)).toBeLessThanOrEqual(15.05);
  });

  it("el visitante no puede colar texto en la instrucción", async () => {
    const form = new FormData();
    form.set("photo", jpegBlob(), "foto.jpg");
    form.set("animation", "saludo");
    form.set("consent", "true");
    form.set("prompt", "the person says something offensive");
    await POST(new Request("http://localhost/api/generate", { method: "POST", body: form, headers: { "x-forwarded-for": nextIp() } }));
    expect(model.submit.mock.calls[0][0].prompt).not.toMatch(/offensive/);
  });

  it("el modelo se puede cambiar por configuración y la clave se lee en cada petición", async () => {
    process.env.OPENROUTER_VIDEO_MODEL = "x-ai/grok-imagine-video-1.5";
    process.env.OPENROUTER_API_KEY = "otra-clave";
    await post();
    const [body, headers] = model.submit.mock.calls[0];
    expect(body.model).toBe("x-ai/grok-imagine-video-1.5");
    expect(headers.get("authorization")).toBe("Bearer otra-clave");
    delete process.env.OPENROUTER_VIDEO_MODEL;
  });

  it("la clave solo viaja a OpenRouter, no al dominio desde el que se descarga el vídeo", async () => {
    const elsewhere = "https://cdn.example.net/salida.mp4";
    model.poll.mockImplementation(() => jsonResponse({ id: JOB, status: "completed", unsigned_urls: [elsewhere] }));
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (url === API) return model.submit(JSON.parse(String(init?.body)), headers);
      if (url === `${API}/${JOB}`) return model.poll();
      if (url === elsewhere) {
        expect(headers.get("authorization")).toBeNull();
        return new Response(new Uint8Array(unmarkedVideo));
      }
      throw new Error(url);
    });
    expect((await post()).status).toBe(200);
  });

  it("la foto que llega al modelo no conserva EXIF", async () => {
    await post({ photo: jpegBlob(withFakeExif(jpeg)), photoName: "IMG_2024_casa_de_ana.jpg" });
    const url: string = model.submit.mock.calls[0][0].frame_images[0].image_url.url;
    const sent = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    expect(sent.includes(EXIF_MARKER_TEXT)).toBe(false);
    expect(sent.includes("Exif")).toBe(false);
    expect(JSON.stringify(model.submit.mock.calls[0][0])).not.toContain("casa_de_ana");
  });
});

describe("POST /api/generate — validación (sección 11)", () => {
  it("sin consent=true → 400", async () => {
    for (const consent of [null, "false", "1", "TRUE", "yes", ""]) {
      const { status, body } = await post({ consent });
      expect(status).toBe(400);
      expect(body.error).toBe("consent");
    }
    expect(model.submit).not.toHaveBeenCalled();
  });

  it("animation inventada → 400", async () => {
    for (const animation of [null, "", "baile", "SALUDO", "saludo ", "constructor", "toString", "__proto__", "hasOwnProperty", "../guino"]) {
      const { status, body } = await post({ animation });
      expect(status, `animation=${animation}`).toBe(400);
      expect(body.error).toBe("animation");
    }
    expect(model.submit).not.toHaveBeenCalled();
  });

  it("algo que no sea JPEG → 400", async () => {
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c626001000000050001" + "0d0a2db40000000049454e44ae426082",
      "hex",
    );
    const cases: FormOptions[] = [
      { photo: jpegBlob(png, "image/png") }, // PNG declarado como PNG
      { photo: jpegBlob(png, "image/jpeg") }, // PNG disfrazado de JPEG
      { photo: jpegBlob(jpeg, "image/webp") }, // JPEG mal declarado
      { photo: jpegBlob(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/jpeg") },
      { photo: jpegBlob(jpeg.subarray(0, 300)) }, // JPEG truncado
      { photo: "esto es texto, no un fichero" },
      { photo: null },
    ];
    for (const options of cases) {
      const { status, body } = await post(options);
      expect(status).toBe(400);
      expect(body.error).toBe("photo");
    }
    expect(model.submit).not.toHaveBeenCalled();
  });

  it("JPEG que no mide 512×512 → 400", async () => {
    const wide = await makeJpeg({ width: 640, height: 480 });
    const { status, body } = await post({ photo: jpegBlob(wide) });
    expect(status).toBe(400);
    expect(body.error).toBe("photo");
  });

  it("foto de más de 2 MB → 400", async () => {
    // JPEG válido de 512×512 inflado con un comentario hasta pasar de 2 MB.
    const padding = Buffer.alloc(60_000, 0x41);
    const segments: Buffer[] = [];
    for (let i = 0; i < 34; i += 1) {
      const header = Buffer.from([0xff, 0xfe, 0, 0]);
      header.writeUInt16BE(padding.length + 2, 2);
      segments.push(header, padding);
    }
    const big = Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
    expect(big.length).toBeGreaterThan(2_000_000);
    expect(big.length).toBeLessThan(2_060_000);

    const { status, body } = await post({ photo: jpegBlob(big) });
    expect(status).toBe(400);
    expect(body.error).toBe("photo");
  });

  it("cuerpo enorme → 400 sin llegar a cargarlo en memoria", async () => {
    // Con Content-Length declarado.
    const declared = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(50 * 1024 * 1024),
        "x-forwarded-for": nextIp(),
      },
      body: "--x--",
    });
    expect((await POST(declared)).status).toBe(400);

    // Sin Content-Length: flujo que no termina nunca.
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(new Uint8Array(256 * 1024));
      },
    });
    const streamed = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "x-forwarded-for": nextIp() },
      body: endless,
      // @ts-expect-error: `duplex` es obligatorio en Node para cuerpos en flujo.
      duplex: "half",
    });
    const response = await POST(streamed);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("photo");
    expect(sent).toBeLessThan(20);
  });

  it("cuerpo que no es un formulario → 400", async () => {
    const json = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify({ consent: "true", animation: "saludo" }),
    });
    const response = await POST(json);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
  });

  it("las peticiones rechazadas no gastan intentos", async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i += 1) await post({ ip, consent: "false" });
    for (let i = 0; i < 3; i += 1) expect((await post({ ip })).status).toBe(200);
  });
});

describe("POST /api/generate — límites e interruptor (sección 11)", () => {
  it("cuarto intento de la misma IP en un día → 429 con mensaje amable", async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i += 1) {
      const { status, body } = await post({ ip });
      expect(status).toBe(200);
      expect(body.remaining).toBe(2 - i);
    }
    const { status, body, response } = await post({ ip });
    expect(status).toBe(429);
    expect(body).toMatchObject({ error: "limit", scope: "ip" });
    expect(String(body.message)).toMatch(/límite de 3 vídeos por día/);
    expect(String(body.message)).toMatch(/Vuelve mañana/);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(model.submit).toHaveBeenCalledTimes(3);

    // Otra persona, desde otra IP, sigue pudiendo.
    expect((await post()).status).toBe(200);
  });

  it("inventarse X-Forwarded-For no evita el límite", async () => {
    const real = nextIp();
    for (let i = 0; i < 3; i += 1) {
      expect((await post({ headers: { "x-forwarded-for": `10.0.0.${i}, ${real}` } })).status).toBe(200);
    }
    const { status } = await post({ headers: { "x-forwarded-for": `10.9.9.9, ${real}` } });
    expect(status).toBe(429);
  });

  it("tope global diario → 429", async () => {
    process.env.MAX_GLOBAL_PER_DAY = "2";
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    const { status, body } = await post();
    expect(status).toBe(429);
    expect(body).toMatchObject({ error: "limit", scope: "global" });
    expect(String(body.message)).toMatch(/tope de vídeos por hoy/);
  });

  it("DEMO_ENABLED=false → 503", async () => {
    for (const value of ["false", "", "TRUE", "1", undefined]) {
      if (value === undefined) delete process.env.DEMO_ENABLED;
      else process.env.DEMO_ENABLED = value;
      const { status, body } = await post();
      expect(status).toBe(503);
      expect(body.error).toBe("demo_off");
    }
    expect(model.submit).not.toHaveBeenCalled();
  });

  it("sin clave → 503 y no se pierde el intento", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const ip = nextIp();
    for (let i = 0; i < 5; i += 1) {
      const { status, body } = await post({ ip });
      expect(status).toBe(503);
      expect(body.error).toBe("unavailable");
    }
    process.env.OPENROUTER_API_KEY = "clave-de-prueba";
    expect((await post({ ip })).body.remaining).toBe(2);
  });

  it("petición lanzada desde otra web → 403", async () => {
    const cross = await post({ headers: { "sec-fetch-site": "cross-site", origin: "https://otra.example" } });
    expect(cross.status).toBe(403);
    const mismatch = await post({ headers: { origin: "https://otra.example", host: "localhost" } });
    expect(mismatch.status).toBe(403);
    const same = await post({ headers: { "sec-fetch-site": "same-origin", origin: "http://localhost" } });
    expect(same.status).toBe(200);
    expect(model.submit).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/generate — fallos del modelo", () => {
  it("foto rechazada por el modelo → error claro, y el intento cuenta", async () => {
    model.poll.mockImplementation(() =>
      jsonResponse({ id: JOB, status: "failed", error: "Content moderation rejected https://x.example/foto" }),
    );
    const ip = nextIp();
    const { status, body } = await post({ ip });
    expect(status).toBe(422);
    expect(body.error).toBe("rejected");
    expect(JSON.stringify(body)).not.toMatch(/https?:/);
    expect(countTemp()).toBe(0);
    await post({ ip });
    await post({ ip });
    expect((await post({ ip })).status).toBe(429);
  });

  it("petición rechazada al enviarla (400) → 422", async () => {
    model.submit.mockImplementation(() => jsonResponse({ error: { message: "Invalid image" } }, 400));
    const { status, body } = await post();
    expect(status).toBe(422);
    expect(body.error).toBe("rejected");
  });

  it("servicio saturado → 503 y el visitante no pierde el intento", async () => {
    model.submit.mockImplementation(() => jsonResponse({ error: { message: "Overloaded" } }, 503));
    const ip = nextIp();
    for (let i = 0; i < 4; i += 1) {
      const { status, body } = await post({ ip });
      expect(status).toBe(503);
      expect(body.error).toBe("busy");
    }
  });

  it("clave inválida o sin saldo → 503 'unavailable'", async () => {
    for (const code of [401, 402, 403]) {
      model.submit.mockImplementation(() => jsonResponse({ error: { message: "x" } }, code));
      const { status, body } = await post();
      expect(status).toBe(503);
      expect(body.error).toBe("unavailable");
    }
  });

  it("si el servicio nunca aceptó el trabajo, se devuelve también el hueco global", async () => {
    process.env.MAX_GLOBAL_PER_DAY = "1";
    model.submit.mockImplementationOnce(() => {
      throw new TypeError("fetch failed");
    });
    expect((await post()).status).toBe(503);
    expect((await post()).status).toBe(200);
  });

  it("si lo aceptó y luego se agota el tiempo, el hueco global se queda consumido", async () => {
    process.env.MAX_GLOBAL_PER_DAY = "1";
    process.env.GENERATION_TIMEOUT_SECONDS = "5";
    model.poll.mockImplementation(() => jsonResponse({ id: JOB, status: "in_progress" }));
    const first = await post();
    expect(first.status).toBe(503);
    expect(first.body.error).toBe("busy");
    expect((await post()).status).toBe(429);
    delete process.env.GENERATION_TIMEOUT_SECONDS;
  });

  it("espera mientras el trabajo está en curso", async () => {
    model.poll
      .mockImplementationOnce(() => jsonResponse({ id: JOB, status: "pending" }))
      .mockImplementationOnce(() => jsonResponse({ id: JOB, status: "in_progress" }));
    expect((await post()).status).toBe(200);
    expect(model.poll).toHaveBeenCalledTimes(3);
  });

  it("sin unsigned_urls, descarga del punto /content", async () => {
    model.poll.mockImplementation(() => jsonResponse({ id: JOB, status: "completed" }));
    expect((await post()).status).toBe(200);
    expect(model.download).toHaveBeenCalledTimes(1);
  });

  it("si la marca de agua falla, no existe ningún vídeo que servir", async () => {
    process.env.WATERMARK_FONT_PATH = "/no/existe/Inter-Bold.ttf";
    const ip = nextIp();
    const { status, body } = await post({ ip });
    expect(status).toBe(500);
    expect(body.error).toBe("internal");
    expect(body.id).toBeUndefined();
    expect(countTemp()).toBe(0);
    delete process.env.WATERMARK_FONT_PATH;
    expect((await post({ ip })).body.remaining).toBe(2);
  });

  it("si lo descargado no es un vídeo, no se sirve nada", async () => {
    model.download.mockImplementation(() => new Response("<html>error</html>"));
    const { status } = await post();
    expect(status).toBe(500);
    expect(countTemp()).toBe(0);
  });
});

describe("POST /api/generate — reintentos seguros", () => {
  const KEY = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

  it("un reintento con la misma clave no vuelve a llamar al modelo", async () => {
    const ip = nextIp();
    const first = await post({ ip, headers: { "idempotency-key": KEY } });
    const retry = await post({ ip, headers: { "idempotency-key": KEY } });
    expect(first.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(model.submit).toHaveBeenCalledTimes(1);

    // Solo se ha gastado un intento.
    expect((await post({ ip })).body.remaining).toBe(1);
  });

  it("dos peticiones simultáneas con la misma clave comparten el resultado", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    model.submit.mockImplementation(async () => {
      await gate;
      return jsonResponse({ id: JOB, polling_url: `/api/v1/videos/${JOB}` });
    });
    const ip = nextIp();
    const a = post({ ip, headers: { "idempotency-key": KEY } });
    const b = post({ ip, headers: { "idempotency-key": KEY } });
    await vi.waitFor(() => expect(model.submit).toHaveBeenCalled());
    release();
    const [first, second] = await Promise.all([a, b]);
    expect(first.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(model.submit).toHaveBeenCalledTimes(1);
  });

  it("el reintento funciona aunque la IP ya esté en su límite", async () => {
    process.env.MAX_PER_IP_PER_DAY = "1";
    const ip = nextIp();
    const first = await post({ ip, headers: { "idempotency-key": KEY } });
    const retry = await post({ ip, headers: { "idempotency-key": KEY } });
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    expect((await post({ ip })).status).toBe(429);
  });

  it("claves con formato raro se ignoran", async () => {
    const ip = nextIp();
    await post({ ip, headers: { "idempotency-key": "corta" } });
    await post({ ip, headers: { "idempotency-key": "corta" } });
    expect(model.submit).toHaveBeenCalledTimes(2);
  });
});
