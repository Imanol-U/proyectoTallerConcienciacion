import { expect, heading, HEADINGS, openPhotoStep, test } from "./helpers";

/** Proyecto "camara-dos-caras": delante de la cámara simulada hay dos personas (dibujadas). */
test("dos caras ante la cámara → «usa una foto en la que solo salgas tú»", async ({ page }) => {
  await openPhotoStep(page);

  const hint = page.getByTestId("camara-pista");
  await expect(hint).toHaveAttribute("data-hint", "many");
  await expect(hint).toHaveText("Solo puede salir una persona en la foto.");

  await page.getByRole("button", { name: "Hacer foto" }).click();
  const notice = page.getByTestId("cara-many");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Usa una foto en la que solo salgas tú");

  await expect(page.getByTestId("foto-capturada")).toHaveCount(0);
  await expect(heading(page, HEADINGS.photo)).toBeVisible();
});
