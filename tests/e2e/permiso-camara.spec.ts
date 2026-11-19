import type { Page } from "@playwright/test";
import { expect, fixture, heading, HEADINGS, openPhotoStep, test } from "./helpers";

/**
 * Permiso de cámara denegado.
 *
 * Chromium sin interfaz no sabe mostrar el aviso de permiso, así que la
 * denegación se reproduce dentro de la página con el mismo error que lanzan
 * los navegadores de verdad (NotAllowedError). Con `__allowCamera = true` se
 * deja pasar a la cámara simulada, como si el visitante hubiera pulsado
 * «Permitir».
 */
async function denyCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    const real = devices.getUserMedia.bind(devices);
    devices.getUserMedia = (constraints) => {
      if ((window as unknown as { __allowCamera?: boolean }).__allowCamera) return real(constraints);
      return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    };
  });
}

test("sin permiso de cámara → instrucciones para activarlo", async ({ page }) => {
  await denyCamera(page);
  await openPhotoStep(page);

  const help = page.getByTestId("camara-sin-permiso");
  await expect(help).toBeVisible();
  await expect(help).toContainText("No tenemos permiso para usar la cámara");
  await expect(help).toContainText("Pulsa el icono del candado");
  await expect(help).toContainText("Permitir");
  await expect(help).toContainText("Reintentar");
  await expect(help).toContainText("Ajustes → Safari → Cámara");

  await expect(page.getByRole("button", { name: "Hacer foto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();

  // Con la subida activada, se ofrece la alternativa.
  await page.getByRole("button", { name: "Subir una foto" }).click();
  await expect(page.getByTestId("pestana-upload")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("archivo").setInputFiles(fixture("cara.jpg"));
  await expect(page.getByTestId("recorte-ok")).toBeVisible();
  await page.getByTestId("usar-foto").click();
  await expect(heading(page, HEADINGS.animation)).toBeVisible();
});

test("al conceder el permiso y pulsar «Reintentar», la cámara arranca", async ({ page }) => {
  await denyCamera(page);
  await openPhotoStep(page);
  await expect(page.getByTestId("camara-sin-permiso")).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __allowCamera?: boolean }).__allowCamera = true;
  });
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByTestId("camara-sin-permiso")).toHaveCount(0);
  await expect(page.getByTestId("camara-pista")).toHaveAttribute("data-hint", "good");
  await expect(page.getByRole("button", { name: "Hacer foto" })).toBeEnabled();
});

test("sin ninguna cámara → se explica y se ofrece subir una foto", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Requested device not found", "NotFoundError"));
  });
  await openPhotoStep(page);
  await expect(page.getByTestId("camara-error")).toContainText("No encontramos ninguna cámara");
  await expect(page.getByRole("button", { name: "Subir una foto" })).toBeVisible();
});
