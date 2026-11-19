import { expect, heading, HEADINGS, openPhotoStep, test } from "./helpers";

/**
 * Proyecto "camara-sin-cara": la cámara simulada de Chromium emite una carta
 * de ajuste, sin ninguna cara.
 */
test("foto sin cara → error claro al usuario, y no se pasa de paso", async ({ page }) => {
  await openPhotoStep(page);

  // La instrucción del plan, tal cual, mientras no se ve ninguna cara.
  const hint = page.getByTestId("camara-pista");
  await expect(hint).toHaveText("Coloca tu cara dentro del óvalo y mira a la cámara.");
  await expect(hint).toHaveAttribute("data-hint", "searching");

  await page.getByRole("button", { name: "Hacer foto" }).click();
  const notice = page.getByTestId("cara-none");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("No vemos ninguna cara");

  await expect(page.getByTestId("foto-capturada")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Usar esta foto" })).toHaveCount(0);
  await expect(heading(page, HEADINGS.photo)).toBeVisible();
});

test("la cámara se apaga al salir del paso", async ({ page }) => {
  await openPhotoStep(page);
  const video = page.getByTestId("camara-video");
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => (el.srcObject as MediaStream | null)?.getVideoTracks()[0]?.readyState))
    .toBe("live");

  // Guarda la pista para poder mirarla cuando el componente ya no exista.
  await video.evaluate((el: HTMLVideoElement) => {
    (window as unknown as { __track: MediaStreamTrack }).__track = (el.srcObject as MediaStream).getVideoTracks()[0];
  });
  // Nunca se pide el micrófono.
  expect(await video.evaluate((el: HTMLVideoElement) => (el.srcObject as MediaStream).getAudioTracks().length)).toBe(0);

  await page.getByRole("button", { name: "Volver" }).click();
  await expect(heading(page, HEADINGS.consent)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __track: MediaStreamTrack }).__track.readyState))
    .toBe("ended");
});
