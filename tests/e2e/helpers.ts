import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page, type Response as PageResponse, test as base } from "@playwright/test";
import { sanitizeJpeg } from "../../lib/jpeg";
import { MOCK_DIR } from "../../playwright.config";

export const FIXTURES = path.resolve(__dirname, "../fixtures");
export const fixture = (name: string): string => path.join(FIXTURES, name);

export interface MockCall {
  call: string;
  [key: string]: unknown;
}

/** Mando a distancia del OpenRouter simulado (tests/support/mock-modelo.mjs). */
export class FalMock {
  private offset = 0;

  async set(control: { mode?: "ok" | "rejected" | "down"; delayMs?: number }): Promise<void> {
    await writeFile(path.join(MOCK_DIR, "control.json"), JSON.stringify({ mode: "ok", delayMs: 300, ...control }));
  }

  private async all(): Promise<MockCall[]> {
    try {
      const text = await readFile(path.join(MOCK_DIR, "calls.jsonl"), "utf8");
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as MockCall);
    } catch {
      return [];
    }
  }

  /** A partir de ahora, `calls()` solo devuelve lo que llegue después. */
  async mark(): Promise<void> {
    this.offset = (await this.all()).length;
  }

  /** Llamadas que ha recibido el modelo durante esta prueba. */
  async calls(kind?: string): Promise<MockCall[]> {
    const calls = (await this.all()).slice(this.offset);
    return kind ? calls.filter((entry) => entry.call === kind) : calls;
  }
}

let ipCounter = 0;

interface SentForm {
  fields: Record<string, string>;
  /** La foto, en base64. */
  photo: string;
}

declare global {
  interface Window {
    __sentForms?: SentForm[];
  }
}

/**
 * Se ejecuta dentro de la página antes que la aplicación: anota, byte a byte,
 * lo que el navegador envía a /api/generate.
 */
function recordGenerateRequests() {
  const originalFetch = window.fetch.bind(window);
  window.__sentForms = [];
  window.fetch = async (input, init) => {
    if (String(input).includes("/api/generate") && init?.body instanceof FormData) {
      const entry: SentForm = { fields: {}, photo: "" };
      for (const [name, value] of init.body.entries()) {
        if (typeof value === "string") {
          entry.fields[name] = value;
          continue;
        }
        entry.fields[`${name}Type`] = value.type;
        entry.fields[`${name}Name`] = value.name;
        const bytes = new Uint8Array(await value.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        entry.photo = btoa(binary);
      }
      window.__sentForms?.push(entry);
    }
    return originalFetch(input, init);
  };
}

export const test = base.extend<{ fal: FalMock; clientIp: string }>({
  page: async ({ page }, provide) => {
    await page.addInitScript(recordGenerateRequests);
    await provide(page);
  },
  // Cada prueba llega "desde una IP distinta": así no comparten el límite diario.
  clientIp: async ({}, provide) => {
    ipCounter += 1;
    const random = () => 1 + Math.floor(Math.random() * 250);
    await provide(`10.${random()}.${random()}.${(ipCounter % 250) + 1}`);
  },
  extraHTTPHeaders: async ({ clientIp }, provide) => {
    await provide({ "X-Forwarded-For": clientIp });
  },
  fal: async ({}, provide) => {
    const mock = new FalMock();
    await mock.set({ mode: "ok" });
    await mock.mark();
    await provide(mock);
    await mock.set({ mode: "ok" });
  },
});

export { expect };

export const HEADINGS = {
  consent: "Antes de empezar, tu permiso",
  photo: "Ahora, tu cara",
  animation: "Elige qué va a hacer tu cara",
  waiting: "Fabricando tu vídeo falso…",
  done: "Tú nunca has hecho esto.",
} as const;

export const CONSENT_LABELS = [
  "Soy mayor de 18 años.",
  "La persona de la foto soy yo, y es adulta. No usaré fotos de otras personas.",
  /Acepto que mi foto se envíe a un servicio externo de IA para generar el vídeo y se borre después\./,
] as const;

export function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

/** Portada → consentimiento. Reintenta el clic hasta que la página responde. */
export async function openConsent(page: Page, url = "/"): Promise<void> {
  await page.goto(url);
  await expect(async () => {
    await page.getByTestId("empezar").click();
    await expect(heading(page, HEADINGS.consent)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/** Portada → consentimiento (tres casillas) → paso de la foto. */
export async function openPhotoStep(page: Page, url = "/"): Promise<void> {
  await openConsent(page, url);
  for (const label of CONSENT_LABELS) await page.getByLabel(label).check();
  await page.getByTestId("aceptar").click();
  await expect(heading(page, HEADINGS.photo)).toBeVisible();
}

export type FileToUpload = string | { name: string; mimeType: string; buffer: Buffer };

export async function chooseFile(page: Page, file: FileToUpload) {
  await page.getByTestId("pestana-upload").click();
  await page.getByTestId("archivo").setInputFiles(file);
}

/** Sube una foto con una cara y la acepta: deja la página en el paso 4. */
export async function uploadFace(page: Page, file: FileToUpload = fixture("cara.jpg")): Promise<void> {
  await chooseFile(page, file);
  await expect(page.getByTestId("recorte-ok")).toBeVisible();
  await page.getByTestId("usar-foto").click();
  await expect(heading(page, HEADINGS.animation)).toBeVisible();
}

export interface GenerateCapture {
  /** Respuesta de POST /api/generate. */
  response: PageResponse;
  body: Record<string, unknown>;
  /** La foto tal como salió del navegador. */
  photo: Buffer;
  fields: Record<string, string>;
}

/** Elige una animación, pulsa "Generar vídeo" y captura la petición y su respuesta. */
export async function generate(page: Page, animation = "saludo"): Promise<GenerateCapture> {
  await page.getByTestId(`animacion-${animation}`).click();
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/generate") && r.request().method() === "POST", {
      timeout: 45_000,
    }),
    page.getByTestId("generar").click(),
  ]);

  const sent = await page.evaluate(() => window.__sentForms?.at(-1) ?? null);
  if (!sent) throw new Error("no se ha registrado ninguna petición a /api/generate");
  const fields = sent.fields;
  const photo = Buffer.from(sent.photo, "base64");
  return { response, body: (await response.json()) as Record<string, unknown>, photo, fields };
}

/**
 * Comprueba que unos bytes son un JPEG de 512×512 sin metadatos del original
 * (EXIF, GPS, fecha, modelo de cámara, XMP).
 *
 * Chromium añade al exportar un perfil de color sRGB genérico: no dice nada
 * de la foto original. Con `bare` se exige que tampoco esté (es lo que llega
 * al modelo después de pasar por el servidor).
 */
export function expectCleanJpeg(photo: Buffer, { bare = false }: { bare?: boolean } = {}): void {
  expect(photo.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  const parsed = sanitizeJpeg(photo);
  expect(parsed).toMatchObject({ ok: true, width: 512, height: 512 });
  const traces = ["Exif", "GPS", "CamaraDePrueba", "Modelo X", "2026:01:02", "xmpmeta", "ns.adobe.com"];
  if (bare) traces.push("ICC_PROFILE");
  for (const trace of traces) {
    expect(photo.includes(trace), `la foto no debería contener «${trace}»`).toBe(false);
  }
}

/** La foto tal como la recibió el modelo (la del último envío). */
export async function photoSeenByFal(fal: FalMock): Promise<Buffer> {
  const last = (await fal.calls("submit")).at(-1);
  if (!last?.saved) throw new Error("el modelo no ha recibido ninguna foto");
  return readFile(String(last.saved));
}

/** Texto que jamás debe llegar al navegador. */
export const FORBIDDEN_IN_BROWSER = [
  "openrouter.ai",
  "x-ai/grok",
  "does not speak",
  "clave-de-prueba",
  "OPENROUTER_API_KEY",
] as const;

/**
 * Vigila TODO lo que recibe el navegador durante la prueba y devuelve una
 * función que comprueba que no ha llegado ninguna URL del servicio de IA, ni la instrucción, ni la clave, y
 * que no se ha hablado con ningún otro servidor.
 */
export function watchNetwork(page: Page, baseURL: string): () => Promise<void> {
  const origin = new URL(baseURL).origin;
  const responses: PageResponse[] = [];
  const foreign: string[] = [];
  page.on("response", (response) => responses.push(response));
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith("blob:") && !url.startsWith("data:")) foreign.push(url);
  });

  return async () => {
    expect(foreign, "el navegador no debe pedir nada a otros servidores").toEqual([]);
    expect(responses.length).toBeGreaterThan(5);
    for (const response of responses) {
      const where = `${response.status()} ${response.url()}`;
      const headers = JSON.stringify(await response.allHeaders());
      for (const text of FORBIDDEN_IN_BROWSER) {
        expect(response.url().includes(text), `URL ${where}`).toBe(false);
        expect(headers.includes(text), `cabeceras de ${where}`).toBe(false);
      }
      const type = (await response.headerValue("content-type")) ?? "";
      if (!/json|html|javascript|text|x-component/.test(type)) continue;
      const body = await response.text().catch(() => "");
      for (const text of FORBIDDEN_IN_BROWSER) {
        expect(body.includes(text), `«${text}» en el cuerpo de ${where}`).toBe(false);
      }
    }
  };
}
