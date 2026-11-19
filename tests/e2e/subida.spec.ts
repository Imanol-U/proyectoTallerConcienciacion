import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  chooseFile,
  expect,
  expectCleanJpeg,
  fixture,
  generate,
  heading,
  HEADINGS,
  openPhotoStep,
  photoSeenByFal,
  test,
  uploadFace,
} from "./helpers";

/** Pestaña "Subir foto": formatos, tamaño, metadatos, recorte y detección de caras. */

for (const [format, file] of [
  ["PNG", "cara.png"],
  ["WebP", "cara.webp"],
  ["JPEG", "cara.jpg"],
] as const) {
  test(`subir un ${format} funciona y al servidor le llega un JPEG 512×512`, async ({ page }) => {
    await openPhotoStep(page);
    await uploadFace(page, fixture(file));
    const { response, photo, fields } = await generate(page);
    expect(response.status()).toBe(200);
    expect(fields.photoType).toBe("image/jpeg");
    expectCleanJpeg(photo);
  });
}

test("la foto enviada no conserva metadatos EXIF (ni ubicación, ni fecha, ni cámara)", async ({ page, fal }) => {
  const original = await readFile(fixture("cara-exif-gps.jpg"));
  expect(original.includes("Exif")).toBe(true);
  expect(original.includes("CamaraDePrueba")).toBe(true);

  await openPhotoStep(page);
  await uploadFace(page, fixture("cara-exif-gps.jpg"));
  const { response, photo, fields } = await generate(page);
  expect(response.status()).toBe(200);

  // Lo que salió del navegador…
  expectCleanJpeg(photo);
  // …con un nombre genérico, no el del archivo original…
  expect(fields.photoName).toBe("foto.jpg");
  // …y lo que el servidor reenvió al modelo.
  expectCleanJpeg(await photoSeenByFal(fal), { bare: true });
});

test("respeta la orientación de las fotos de móvil", async ({ page }) => {
  // La imagen está guardada tumbada, con orientación EXIF 6. Si no se
  // aplicara, la cara quedaría de lado y el detector no la vería.
  await openPhotoStep(page);
  await uploadFace(page, fixture("cara-girada-exif.jpg"));
});

/** Genera dentro del navegador un PNG con una cara y ruido, de unos `megabytes` MB. */
async function bigFacePng(page: Page, megabytes: number): Promise<Buffer> {
  const source = (await readFile(fixture("cara.png"))).toString("base64");
  const base64 = await page.evaluate(
    async ({ source, megabytes }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const render = async (side: number): Promise<Blob> => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = side;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0, side, side);
        const pixels = ctx.getImageData(0, 0, side, side);
        let seed = 12345;
        for (let i = 0; i < pixels.data.length; i += 1) {
          if (i % 4 === 3) continue;
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          pixels.data[i] = Math.max(0, Math.min(255, pixels.data[i] + ((seed >> 16) % 25) - 12));
        }
        ctx.putImageData(pixels, 0, 0);
        return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
      };
      // Primer intento, y un segundo ajustando el lado al tamaño pedido.
      let side = 1800;
      let blob = await render(side);
      side = Math.round(side * Math.sqrt((megabytes * 1024 * 1024) / blob.size));
      blob = await render(side);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    },
    { source, megabytes },
  );
  return Buffer.from(base64, "base64");
}

test("acepta fotos de hasta 10 MB", async ({ page }) => {
  test.slow();
  await openPhotoStep(page);
  const buffer = await bigFacePng(page, 9.6);
  expect(buffer.length).toBeGreaterThan(9 * 1024 * 1024);
  expect(buffer.length).toBeLessThanOrEqual(10 * 1024 * 1024);

  await uploadFace(page, { name: "foto-enorme.png", mimeType: "image/png", buffer });
  const { response, photo } = await generate(page);
  expect(response.status()).toBe(200);
  expectCleanJpeg(photo);
  // Por grande que sea el original, lo que viaja es pequeño.
  expect(photo.length).toBeLessThan(400_000);
});

test("rechaza fotos de más de 10 MB con un mensaje claro", async ({ page }) => {
  await openPhotoStep(page);
  const buffer = Buffer.alloc(10 * 1024 * 1024 + 1);
  await chooseFile(page, { name: "gigante.png", mimeType: "image/png", buffer });
  await expect(page.getByTestId("subida-size")).toContainText("El máximo son 10 MB");
  await expect(page.getByTestId("recorte")).toHaveCount(0);
});

test("rechaza archivos que no son JPEG, PNG ni WebP", async ({ page }) => {
  await openPhotoStep(page);
  await page.getByTestId("pestana-upload").click();
  await expect(page.getByTestId("archivo")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");

  await chooseFile(page, { name: "animacion.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(page.getByTestId("subida-type")).toContainText("JPEG, PNG o WebP");

  await chooseFile(page, { name: "documento.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await expect(page.getByTestId("subida-type")).toBeVisible();

  // Dice ser un JPEG, pero no lo es.
  await chooseFile(page, { name: "roto.jpg", mimeType: "image/jpeg", buffer: Buffer.from("esto no es una imagen") });
  await expect(page.getByTestId("subida-decode")).toContainText("No hemos podido abrir esa imagen");
});

test("foto con dos caras → aviso «usa una foto en la que solo salgas tú»", async ({ page }) => {
  await openPhotoStep(page);
  await chooseFile(page, fixture("dos-caras.jpg"));
  const notice = page.getByTestId("cara-many");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Usa una foto en la que solo salgas tú");
  // No se llega ni a recortar: la foto se rechaza entera.
  await expect(page.getByTestId("recorte")).toHaveCount(0);
  await expect(page.getByTestId("usar-foto")).toHaveCount(0);
});

test("foto sin cara → error claro y no se puede continuar", async ({ page }) => {
  await openPhotoStep(page);
  await chooseFile(page, fixture("sin-cara.jpg"));
  const notice = page.getByTestId("cara-none");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("No vemos ninguna cara");
  await expect(page.getByTestId("usar-foto")).toBeDisabled();

  // "Repetir" permite elegir otra.
  await page.getByTestId("repetir").click();
  await expect(page.getByText("Sube solo una foto tuya.")).toBeVisible();
  await uploadFace(page, fixture("cara.jpg"));
});

test("junto al botón de subida se avisa: «Sube solo una foto tuya»", async ({ page }) => {
  await openPhotoStep(page);
  await page.getByTestId("pestana-upload").click();
  await expect(page.getByText("Sube solo una foto tuya.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Elegir archivo" })).toBeVisible();
});

test("recorte manual: arrastrar y zoom cambian el encuadre", async ({ page }) => {
  await openPhotoStep(page);
  await chooseFile(page, fixture("cara-exif-gps.jpg"));
  await expect(page.getByTestId("recorte-ok")).toBeVisible();

  const canvas = page.getByTestId("recorte");
  const snapshot = () => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL("image/jpeg", 0.5).length + el.toDataURL().slice(-64));
  const zoom = page.getByTestId("zoom");

  // Zoom con el deslizador
  const before = await snapshot();
  const initialZoom = Number(await zoom.inputValue());
  await zoom.fill(String(Math.min(4, initialZoom + 1)));
  await expect.poll(snapshot).not.toBe(before);

  // Arrastrar con el puntero
  const zoomed = await snapshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  await expect.poll(snapshot).not.toBe(zoomed);

  // Teclado: flechas para mover, +/- para el zoom
  const dragged = await snapshot();
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(snapshot).not.toBe(dragged);
  const zoomBefore = Number(await zoom.inputValue());
  await page.keyboard.press("-");
  await expect.poll(async () => Number(await zoom.inputValue())).toBeLessThan(zoomBefore);

  // Al alejar del todo, la cara vuelve a caber y se puede usar la foto.
  await zoom.fill("1");
  await expect(page.getByTestId("recorte-ok")).toBeVisible();
  await page.getByTestId("usar-foto").click();
  await expect(heading(page, HEADINGS.animation)).toBeVisible();
});
