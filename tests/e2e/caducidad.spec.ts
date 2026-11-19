import { SERVERS } from "../../playwright.config";
import { expect, generate, heading, HEADINGS, openPhotoStep, test, uploadFace } from "./helpers";

/**
 * Caducidad del vídeo. Este servidor de pruebas borra los vídeos a los 6
 * segundos en lugar de a los 10 minutos (VIDEO_TTL_SECONDS=6); el reloj de 10
 * minutos exactos se comprueba en tests/unit/tempStore.test.ts.
 */
test.describe("vídeos de vida corta", () => {
  test.use({ baseURL: SERVERS.shortLived });

  test("pasado el tiempo de vida, /api/video/{id} devuelve 404 y la página lo cuenta", async ({ page }) => {
    await openPhotoStep(page);
    await uploadFace(page);
    const { body } = await generate(page);
    const id = String(body.id);
    expect(body.ttlSeconds).toBe(6);

    await expect(heading(page, HEADINGS.done)).toBeVisible();
    await expect(page.getByTestId("cuenta-atras")).toContainText(/0:0\d/);
    expect((await page.request.get(`/api/video/${id}`)).status()).toBe(200);

    // Sin tocar nada: el servidor lo borra solo…
    await expect.poll(async () => (await page.request.get(`/api/video/${id}`)).status(), { timeout: 15_000 }).toBe(404);

    // …y la página no se queda enseñando un vídeo roto.
    await expect(page.getByTestId("caducado")).toBeVisible();
    await expect(heading(page, "Vídeo borrado.")).toBeVisible();
    await expect(page.getByTestId("video-falso")).toHaveCount(0);
  });
});

// En el servidor normal (10 minutos de vida): si el vídeo desaparece, es por el cierre.
test("cerrar la página borra el vídeo sin esperar a que caduque", async ({ page, context }) => {
  await openPhotoStep(page);
  await uploadFace(page);
  const { body } = await generate(page);
  const id = String(body.id);
  await expect(heading(page, HEADINGS.done)).toBeVisible();

  const other = await context.newPage();
  expect((await other.request.get(`/api/video/${id}`)).status()).toBe(200);

  await page.close({ runBeforeUnload: true });
  await expect.poll(async () => (await other.request.get(`/api/video/${id}`)).status(), { timeout: 4_000 }).toBe(404);
});
