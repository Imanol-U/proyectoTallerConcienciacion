import { readFile } from "node:fs/promises";
import type { APIRequestContext } from "@playwright/test";
import { expect, fixture, generate, heading, HEADINGS, openPhotoStep, test, uploadFace } from "./helpers";

/** Validación del servidor, límite de abuso y fallos del modelo. */

interface DirectOptions {
  photo?: { name: string; mimeType: string; buffer: Buffer } | null;
  animation?: string | null;
  consent?: string | null;
}

/** Petición directa al servidor, sin pasar por la página. */
async function direct(request: APIRequestContext, options: DirectOptions = {}) {
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {};
  const photo =
    options.photo === undefined
      ? { name: "foto.jpg", mimeType: "image/jpeg", buffer: await readFile(fixture("cara.jpg")) }
      : options.photo;
  if (photo) multipart.photo = photo;
  const animation = options.animation === undefined ? "saludo" : options.animation;
  if (animation !== null) multipart.animation = animation;
  const consent = options.consent === undefined ? "true" : options.consent;
  if (consent !== null) multipart.consent = consent;
  return request.post("/api/generate", { multipart });
}

test.describe("peticiones directas al servidor", () => {
  test("una petición correcta genera el vídeo", async ({ request }) => {
    const response = await direct(request);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toContain("openrouter");
  });

  test("sin consent=true → 400", async ({ request }) => {
    for (const consent of [null, "false", "si"]) {
      const response = await direct(request, { consent });
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toBe("consent");
    }
  });

  test("animation inventada → 400", async ({ request }) => {
    for (const animation of [null, "baile", "constructor", "__proto__"]) {
      const response = await direct(request, { animation });
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toBe("animation");
    }
  });

  test("algo que no sea JPEG → 400", async ({ request }) => {
    const png = await readFile(fixture("cara.png"));
    const cases = [
      { name: "foto.png", mimeType: "image/png", buffer: png },
      // Un PNG disfrazado de JPEG: se comprueban los bytes, no la etiqueta.
      { name: "foto.jpg", mimeType: "image/jpeg", buffer: png },
      { name: "foto.webp", mimeType: "image/webp", buffer: await readFile(fixture("cara.webp")) },
      { name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("hola") },
      // JPEG auténtico, pero no de 512×512.
      { name: "grande.jpg", mimeType: "image/jpeg", buffer: await readFile(fixture("cara-exif-gps.jpg")) },
    ];
    for (const photo of cases) {
      const response = await direct(request, { photo });
      expect(response.status(), photo.name).toBe(400);
      expect((await response.json()).error).toBe("photo");
    }
    expect((await direct(request, { photo: null })).status()).toBe(400);
  });

  test("más de 2 MB → 400", async ({ request }) => {
    const jpeg = await readFile(fixture("cara.jpg"));
    // JPEG válido de 512×512 engordado con comentarios hasta pasar de 2 MB.
    const padding = Buffer.alloc(60_000, 0x41);
    const header = Buffer.from([0xff, 0xfe, 0, 0]);
    header.writeUInt16BE(padding.length + 2, 2);
    const filler = Array.from({ length: 34 }, () => [header, padding]).flat();
    const big = Buffer.concat([jpeg.subarray(0, 2), ...filler, jpeg.subarray(2)]);
    expect(big.length).toBeGreaterThan(2_000_000);

    const response = await direct(request, { photo: { name: "foto.jpg", mimeType: "image/jpeg", buffer: big } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe("photo");

    // Y uno muchísimo mayor tampoco tumba el servidor.
    const huge = await direct(request, {
      photo: { name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(12 * 1024 * 1024, 0xff) },
    }).catch(() => null);
    if (huge) expect(huge.status()).toBe(400);
    expect((await request.get("/api/health")).status()).toBe(200);
  });

  test("cuarto intento de la misma IP en un día → 429 con mensaje amable", async ({ request }) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await direct(request);
      expect(response.status(), `intento ${attempt}`).toBe(200);
    }
    const fourth = await direct(request);
    expect(fourth.status()).toBe(429);
    expect(Number(fourth.headers()["retry-after"])).toBeGreaterThan(0);
    const body = await fourth.json();
    expect(body).toMatchObject({ error: "limit", scope: "ip" });
    expect(body.message).toBe("Has llegado al límite de 3 vídeos por día. Vuelve mañana: la demo seguirá aquí.");
  });

  test("otra web no puede lanzar peticiones con el navegador del visitante", async ({ request }) => {
    const response = await request.post("/api/generate", {
      multipart: { consent: "true", animation: "saludo" },
      headers: { Origin: "https://otra-web.example", "Sec-Fetch-Site": "cross-site" },
    });
    expect(response.status()).toBe(403);
  });

  test("la ruta del vídeo no acepta identificadores raros", async ({ request }) => {
    for (const id of ["nada", "00000000-0000-4000-8000-000000000000", "..%2F..%2Fetc%2Fpasswd"]) {
      const response = await request.get(`/api/video/${id}`);
      expect(response.status()).toBe(404);
    }
  });
});

test.describe("en la página", () => {
  test("al cuarto vídeo, la página explica el límite con amabilidad", async ({ page }) => {
    test.slow();
    await openPhotoStep(page);
    await uploadFace(page);

    for (const [index, animation] of (["saludo", "sonrisa", "guino"] as const).entries()) {
      const { response, body } = await generate(page, animation);
      expect(response.status()).toBe(200);
      expect(body.remaining).toBe(2 - index);
      await expect(heading(page, HEADINGS.done)).toBeVisible();
      await page.getByRole("button", { name: "Probar otra animación" }).click();
      await expect(heading(page, HEADINGS.animation)).toBeVisible();
    }
    await expect(page.getByText("Ya has usado todos tus vídeos de hoy.")).toBeVisible();

    const { response } = await generate(page, "sorpresa");
    expect(response.status()).toBe(429);
    const notice = page.getByTestId("error-limit");
    await expect(notice).toContainText("Límite diario alcanzado");
    await expect(notice).toContainText("Has llegado al límite de 3 vídeos por día. Vuelve mañana");
    // Aunque no pueda generar más, lo importante sigue a la vista.
    await expect(page.getByTestId("bloque-detectar")).toBeVisible();
    await expect(page.getByTestId("bloque-ayuda")).toBeVisible();
  });

  test("al probar otra animación, el vídeo anterior se borra del servidor", async ({ page }) => {
    await openPhotoStep(page);
    await uploadFace(page);
    const first = await generate(page, "saludo");
    await expect(heading(page, HEADINGS.done)).toBeVisible();
    expect((await page.request.get(`/api/video/${first.body.id}`)).status()).toBe(200);

    await page.getByRole("button", { name: "Probar otra animación" }).click();
    await expect(heading(page, HEADINGS.animation)).toBeVisible();
    await expect.poll(async () => (await page.request.get(`/api/video/${first.body.id}`)).status()).toBe(404);
  });

  test("si el modelo rechaza la foto, el error es claro y se puede cambiar la foto", async ({ page, fal }) => {
    await fal.set({ mode: "rejected" });
    await openPhotoStep(page);
    await uploadFace(page);
    const { response, body } = await generate(page);
    expect(response.status()).toBe(422);
    expect(body.error).toBe("rejected");

    const notice = page.getByTestId("error-rejected");
    await expect(notice).toContainText("Esa foto no nos sirve");
    await expect(notice).toContainText("El modelo no ha podido usar esta foto");
    // El error no arrastra ninguna URL del servicio hasta el navegador.
    expect(JSON.stringify(body)).not.toMatch(/openrouter|https?:/);

    await page.getByTestId("cambiar-foto").click();
    await expect(heading(page, HEADINGS.photo)).toBeVisible();
  });

  test("si el servicio de IA falla, se puede reintentar y el intento no cuenta", async ({ page, fal }) => {
    await fal.set({ mode: "down" });
    await openPhotoStep(page);
    await uploadFace(page);
    const failed = await generate(page);
    expect(failed.response.status()).toBe(503);
    await expect(page.getByTestId("error-busy")).toContainText("este intento no cuenta");

    await fal.set({ mode: "ok" });
    const [retry] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/generate")),
      page.getByTestId("reintentar").click(),
    ]);
    expect(retry.status()).toBe(200);
    expect((await retry.json()).remaining).toBe(2);
    await expect(heading(page, HEADINGS.done)).toBeVisible();
  });

  test("si el vídeo no carga por un fallo de red, se puede reintentar (y no se dice que se ha borrado)", async ({ page }) => {
    await openPhotoStep(page);
    await uploadFace(page);

    // El vídeo se genera, pero la conexión falla justo al ir a cargarlo.
    await page.route("**/api/video/**", (route) => route.abort("internetdisconnected"));
    const { body } = await generate(page);
    await expect(heading(page, HEADINGS.done)).toBeVisible();
    await expect(page.getByText("No se ha podido cargar el vídeo. Revisa tu conexión.")).toBeVisible();
    await expect(page.getByTestId("caducado")).toHaveCount(0);

    // Vuelve la conexión: el vídeo sigue en el servidor y se reproduce.
    await page.unroute("**/api/video/**");
    await page.getByTestId("recargar-video").click();
    const video = page.getByTestId("video-falso");
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.1);
    await expect(page.getByTestId("recargar-video")).toHaveCount(0);
    expect((await page.request.get(`/api/video/${body.id}`)).status()).toBe(200);
  });

  test("si la conexión se corta, el reintento recupera el mismo vídeo sin generar otro", async ({ page, fal }) => {
    await openPhotoStep(page);
    await uploadFace(page);

    // La primera respuesta se pierde por el camino: el servidor genera el
    // vídeo, pero el navegador solo ve un error de red.
    await page.evaluate(() => {
      const realFetch = window.fetch;
      let dropped = false;
      window.fetch = async (input, init) => {
        const response = await realFetch(input, init);
        if (!dropped && String(input).includes("/api/generate")) {
          dropped = true;
          throw new TypeError("Failed to fetch");
        }
        return response;
      };
    });

    const keys: string[] = [];
    const statuses: number[] = [];
    page.on("response", (response) => {
      if (!response.url().endsWith("/api/generate")) return;
      keys.push(response.request().headers()["idempotency-key"]);
      statuses.push(response.status());
    });

    await page.getByTestId("animacion-saludo").click();
    await page.getByTestId("generar").click();
    await expect(heading(page, HEADINGS.done)).toBeVisible({ timeout: 30_000 });

    // Dos peticiones (la perdida y el reintento), las dos con la misma clave y
    // las dos respondidas con éxito por el servidor…
    expect(statuses).toEqual([200, 200]);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    // …pero el modelo solo se ha llamado una vez.
    expect(await fal.calls("submit")).toHaveLength(1);
  });
});
