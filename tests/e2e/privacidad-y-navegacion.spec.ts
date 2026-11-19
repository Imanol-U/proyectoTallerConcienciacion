import { CONSENT_LABELS, expect, heading, HEADINGS, openConsent, openPhotoStep, test, uploadFace } from "./helpers";

test.describe("aviso de privacidad", () => {
  test("explica qué se envía, a quién, cuánto dura y cómo borrar", async ({ page }) => {
    await page.goto("/privacidad");
    await expect(heading(page, "Qué pasa con tu foto.")).toBeVisible();

    const body = page.locator("article");
    // Qué se envía
    await expect(body).toContainText("una foto de tu cara, recortada a 512×512 píxeles y sin metadatos");
    // A quién
    await expect(body).toContainText("OpenRouter");
    await expect(body).toContainText("xAI");
    // Cuánto dura
    await expect(body).toContainText("10 minutos como máximo");
    // Cómo borrar
    await expect(body).toContainText("«Borrar mis datos ahora»");
    // Sin cookies ni analítica
    await expect(body).toContainText("no instala cookies, no usa analítica");
    // Base legal y edad
    await expect(body).toContainText("consentimiento explícito");
    await expect(body).toContainText("mayores de 18 años");
  });

  test("se llega desde la tercera casilla y, al volver, el consentimiento sigue marcado", async ({ page }) => {
    await openConsent(page);
    await page.getByLabel(CONSENT_LABELS[0]).check();
    await page.getByLabel(CONSENT_LABELS[1]).check();

    await page.getByRole("link", { name: "Aviso de privacidad" }).first().click();
    await expect(heading(page, "Qué pasa con tu foto.")).toBeVisible();

    await page.goBack();
    await expect(heading(page, HEADINGS.consent)).toBeVisible();
    await expect(page.getByLabel(CONSENT_LABELS[0])).toBeChecked();
    await expect(page.getByLabel(CONSENT_LABELS[1])).toBeChecked();
    await expect(page.getByLabel(CONSENT_LABELS[2])).not.toBeChecked();
  });

  test("ninguna página instala cookies ni guarda nada en el navegador", async ({ page, context }) => {
    await openPhotoStep(page);
    await uploadFace(page);
    await page.goto("/privacidad");
    expect(await context.cookies()).toEqual([]);
    const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
    expect(stored).toEqual({ local: 0, session: 0 });
  });
});

test.describe("navegación", () => {
  test("el botón «atrás» del navegador retrocede un paso, no saca de la demo", async ({ page }) => {
    await openPhotoStep(page);
    await uploadFace(page);
    await expect(page).toHaveURL(/#animacion$/);

    await page.goBack();
    await expect(heading(page, HEADINGS.photo)).toBeVisible();
    await page.goBack();
    await expect(heading(page, HEADINGS.consent)).toBeVisible();
    await page.goForward();
    await expect(heading(page, HEADINGS.photo)).toBeVisible();
    await page.goForward();
    await expect(heading(page, HEADINGS.animation)).toBeVisible();
    await expect(page.getByTestId("foto-elegida")).toBeVisible();
  });

  test("no se puede saltar a un paso sin haber hecho los anteriores", async ({ page }) => {
    // Recargar con un ancla de un paso avanzado devuelve a la portada.
    await page.goto("/#animacion");
    await expect(heading(page, "Con una foto tuya basta para falsificarte en vídeo.")).toBeVisible();
    await expect(page).not.toHaveURL(/#/);

    // Y sin las tres casillas no se llega al paso de la foto.
    await openConsent(page);
    await page.evaluate(() => {
      window.history.pushState(null, "", "#foto");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(heading(page, HEADINGS.consent)).toBeVisible();
  });

  test("la demo se puede recorrer solo con el teclado", async ({ page }) => {
    await page.goto("/");
    await expect(async () => {
      await page.getByTestId("empezar").focus();
      await page.keyboard.press("Enter");
      await expect(heading(page, HEADINGS.consent)).toBeVisible({ timeout: 1_000 });
    }).toPass();
    // Al cambiar de paso, el foco va al título.
    await expect(heading(page, HEADINGS.consent)).toBeFocused();

    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Space");
    }
    for (const label of CONSENT_LABELS) await expect(page.getByLabel(label)).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(heading(page, HEADINGS.photo)).toBeFocused();
  });
});
