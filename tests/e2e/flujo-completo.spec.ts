import { grayFrame, meanLuma, probe } from "../support/media";
import {
  CONSENT_LABELS,
  expect,
  expectCleanJpeg,
  generate,
  heading,
  HEADINGS,
  openConsent,
  photoSeenByFal,
  test,
  watchNetwork,
} from "./helpers";

/**
 * El recorrido entero con la cámara (simulada, con una cara dibujada):
 * portada → consentimiento → foto → animación → espera → resultado → borrado.
 */
test("de la foto al vídeo marcado, y borrado final", async ({ page, baseURL, fal, context }) => {
  const checkNetwork = watchNetwork(page, baseURL!);

  // Paso 1 — Portada
  await page.goto("/");
  await expect(heading(page, "Con una foto tuya basta para falsificarte en vídeo.")).toBeVisible();
  await expect(page.getByText("Compruébalo en 60 segundos, con tu propia cara.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Probar con mi cara" })).toBeVisible();

  // Paso 2 — Consentimiento: las tres casillas son obligatorias
  await openConsent(page);
  await page.getByTestId("aceptar").click();
  await expect(page.getByTestId("error-consentimiento")).toBeVisible();
  await page.getByLabel(CONSENT_LABELS[0]).check();
  await page.getByLabel(CONSENT_LABELS[1]).check();
  await page.getByTestId("aceptar").click();
  await expect(heading(page, HEADINGS.consent)).toBeVisible();
  await page.getByLabel(CONSENT_LABELS[2]).check();
  await page.getByTestId("aceptar").click();

  // Paso 3 — Foto con la cámara (pestaña por defecto)
  await expect(heading(page, HEADINGS.photo)).toBeVisible();
  await expect(page.getByTestId("pestana-camera")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("pestana-upload")).toBeVisible();
  await expect(page.getByTestId("camara-pista")).toHaveAttribute("data-hint", "good");
  await page.getByRole("button", { name: "Hacer foto" }).click();
  await expect(page.getByTestId("foto-capturada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Repetir" })).toBeVisible();

  // "Repetir" vuelve a encender la cámara
  await page.getByRole("button", { name: "Repetir" }).click();
  await expect(page.getByTestId("foto-capturada")).toHaveCount(0);
  await page.getByRole("button", { name: "Hacer foto" }).click();
  await page.getByRole("button", { name: "Usar esta foto" }).click();

  // Paso 4 — Animación: 6 tarjetas con miniatura en bucle
  await expect(heading(page, HEADINGS.animation)).toBeVisible();
  for (const id of ["saludo", "sonrisa", "sorpresa", "guino", "teletransporte", "escenario"]) {
    const card = page.getByTestId(`animacion-${id}`);
    await expect(card).toBeVisible();
    await expect(card.locator("video")).toHaveJSProperty("loop", true);
    await expect(card.locator("video")).toHaveJSProperty("muted", true);
  }
  await page.getByTestId("generar").click();
  await expect(page.getByTestId("error-animacion")).toBeVisible();

  // Paso 5 — Espera (datos rotando) y resultado
  await fal.set({ delayMs: 6_500 });
  const startedAt = Date.now();
  const pending = generate(page, "sorpresa");
  await expect(heading(page, HEADINGS.waiting)).toBeVisible();
  const firstFact = await page.getByTestId("dato").textContent();
  expect(firstFact).toBe("Esto lo hace un servicio comercial al alcance de cualquiera, por unos céntimos.");
  await expect(page.getByTestId("dato")).toHaveText("No hemos necesitado tu voz ni más fotos. Con una ha bastado.", {
    timeout: 8_000,
  });

  const capture = await pending;
  expect(capture.response.status()).toBe(200);
  expect(Date.now() - startedAt).toBeLessThan(60_000);

  // Lo que salió del navegador: JPEG 512×512 sin metadatos, animación y consentimiento
  expectCleanJpeg(capture.photo);
  expect(capture.fields).toMatchObject({ animation: "sorpresa", consent: "true", photoType: "image/jpeg" });

  // La respuesta trae solo un id opaco
  expect(Object.keys(capture.body).sort()).toEqual(["id", "remaining", "ttlSeconds"]);
  const id = String(capture.body.id);

  await expect(heading(page, HEADINGS.done)).toBeVisible();
  const video = page.getByTestId("video-falso");
  await expect(video).toBeVisible();
  await expect(video).toHaveJSProperty("loop", true);
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).toHaveJSProperty("controls", false);
  await expect(video).toHaveAttribute("src", `/api/video/${id}`);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.2);

  // Tres bloques educativos
  const happened = page.getByTestId("bloque-paso");
  await expect(happened).toContainText("Lo que acaba de pasar");
  await expect(happened).toContainText("foto");
  await expect(happened).toContainText(/\d+\s*segundos/);
  await expect(happened).toContainText("coste aprox.");
  await expect(page.getByTestId("bloque-detectar")).toContainText("Parpadeo y dientes raros.");
  await expect(page.getByTestId("bloque-detectar")).toContainText("comprueba la fuente");
  await expect(page.getByTestId("bloque-ayuda")).toContainText("Guarda pruebas.");
  await expect(page.getByTestId("bloque-ayuda")).toContainText("017");

  // Botones: los dos del plan, y ninguno de descarga
  await expect(page.getByRole("button", { name: "Probar otra animación" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar mis datos ahora" })).toBeVisible();
  await expect(page.locator("a[download]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /descargar|download|guardar/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /descargar|download|guardar/i })).toHaveCount(0);

  // El vídeo servido: marca de agua quemada y sin pista de audio
  const served = await page.request.get(`/api/video/${id}`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("video/mp4");
  const bytes = await served.body();
  const info = await probe(bytes);
  expect(info.streams.map((stream) => stream.codec_type)).toEqual(["video"]);
  expect(info.format.tags?.comment).toBe("AI-generated. Educational deepfake demo.");
  const frame = await grayFrame(bytes, 1);
  expect(meanLuma(frame, 4, Math.round(frame.height * 0.92), 44, frame.height - 4)).toBeLessThan(
    meanLuma(frame, 8, 8, 60, 60) * 0.5,
  );

  // Lo que recibió el modelo: clave correcta, instrucción fija y como mucho 5 segundos
  const [submit] = await fal.calls("submit");
  expect(submit.authorized).toBe(true);
  expect(submit.model).toBe("x-ai/grok-imagine-video-1.5-lite");
  expect(submit.duration).toBe(4);
  expect(submit.resolution).toBe("480p");
  expect(submit.aspectRatio).toBe("1:1");
  expect(submit.frameType).toBe("first_frame");
  expect(submit.frames).toBe(1);
  expect(submit.otherKeys).toEqual([]);
  expect(String(submit.prompt)).toMatch(/raises their eyebrows/);
  expectCleanJpeg(await photoSeenByFal(fal), { bare: true });

  // Sin cookies
  expect(await context.cookies()).toEqual([]);

  // "Borrar mis datos ahora": vuelta a la portada y el vídeo deja de existir
  await page.getByRole("button", { name: "Borrar mis datos ahora" }).click();
  await expect(page.getByTestId("aviso-borrado")).toContainText("Hemos borrado el vídeo");
  await expect(heading(page, "Con una foto tuya basta para falsificarte en vídeo.")).toBeVisible();
  expect((await page.request.get(`/api/video/${id}`)).status()).toBe(404);

  // En ninguna respuesta de red aparece una URL del servicio de IA (ni la clave)
  await checkNetwork();
});

test("el vídeo se puede ver en pantalla completa", async ({ page }) => {
  await openConsent(page);
  for (const label of CONSENT_LABELS) await page.getByLabel(label).check();
  await page.getByTestId("aceptar").click();
  await expect(page.getByTestId("camara-pista")).toHaveAttribute("data-hint", "good");
  await page.getByRole("button", { name: "Hacer foto" }).click();
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await generate(page, "saludo");
  await expect(heading(page, HEADINGS.done)).toBeVisible();

  const button = page.getByTestId("pantalla-completa");
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(button).toHaveAccessibleName("Salir de pantalla completa");
  await button.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
});
