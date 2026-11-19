import { readFile } from "node:fs/promises";
import { SERVERS } from "../../playwright.config";
import { expect, fixture, generate, heading, HEADINGS, openPhotoStep, test, uploadFace } from "./helpers";

/** Los dos interruptores: UPLOAD_ENABLED y DEMO_ENABLED. */

test.describe("UPLOAD_ENABLED=false (solo cámara)", () => {
  test.use({ baseURL: SERVERS.cameraOnly });

  test("la pestaña «Subir foto» no aparece y la cámara sigue funcionando", async ({ page }) => {
    await openPhotoStep(page);
    await expect(page.getByTestId("pestana-upload")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByText("Subir foto")).toHaveCount(0);
    await expect(page.getByTestId("archivo")).toHaveCount(0);

    await expect(page.getByTestId("camara-pista")).toHaveAttribute("data-hint", "good");
    await page.getByRole("button", { name: "Hacer foto" }).click();
    await page.getByRole("button", { name: "Usar esta foto" }).click();
    await expect(heading(page, HEADINGS.animation)).toBeVisible();
  });

  test("la portada no menciona la subida de fotos", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Hazte una foto con la cámara de tu dispositivo.")).toBeVisible();
    await expect(page.getByText(/sube una foto/i)).toHaveCount(0);
  });
});

test.describe("DEMO_ENABLED=false (interruptor de apagado)", () => {
  test.use({ baseURL: SERVERS.paused });

  test("la página muestra «demo en pausa» y no ofrece empezar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("demo-en-pausa")).toBeVisible();
    await expect(heading(page, "Demo en pausa.")).toBeVisible();
    await expect(page.getByTestId("empezar")).toHaveCount(0);
    // Lo educativo sigue disponible aunque no se generen vídeos.
    await expect(page.getByTestId("bloque-detectar")).toBeVisible();
    await expect(page.getByTestId("bloque-ayuda")).toBeVisible();
  });

  test("la API responde 503 y no llama al modelo", async ({ request, fal }) => {
    const response = await request.post("/api/generate", {
      multipart: {
        consent: "true",
        animation: "saludo",
        photo: { name: "foto.jpg", mimeType: "image/jpeg", buffer: await readFile(fixture("cara.jpg")) },
      },
    });
    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({ error: "demo_off" });
    expect(await fal.calls()).toEqual([]);
  });
});

test("si la demo se apaga con la página ya abierta, aparece «demo en pausa»", async ({ page }) => {
  await openPhotoStep(page);
  await uploadFace(page);
  // El servidor empieza a responder como si DEMO_ENABLED hubiera pasado a false.
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "demo_off", message: "La demo está en pausa. Vuelve a intentarlo más tarde." }),
    }),
  );
  await generate(page);
  await expect(page.getByTestId("demo-en-pausa")).toBeVisible();
});
