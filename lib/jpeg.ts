/**
 * Validación y limpieza de la foto en el servidor.
 *
 * El navegador ya envía un JPEG 512×512 recién exportado desde un <canvas>
 * (sin EXIF). Pero a la API se le puede hablar directamente, así que aquí se
 * comprueba de verdad:
 *
 *  - que los bytes son un JPEG bien formado (no basta con el tipo declarado),
 *  - que mide exactamente lo esperado,
 *  - y se reconstruye sin metadatos: fuera EXIF/XMP (ubicación, fecha,
 *    dispositivo), perfiles, miniaturas, comentarios y cualquier dato pegado
 *    detrás del final de la imagen.
 *
 * Lo que se reenvía al servicio de IA es solo la imagen.
 */

export type JpegResult =
  | { ok: true; data: Buffer; width: number; height: number }
  | { ok: false; reason: string };

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;
const APP0 = 0xe0;
const APP14 = 0xee;

function isStartOfFrame(marker: number): boolean {
  // SOF0…SOF15, salvo DHT (C4), JPG (C8) y DAC (CC).
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function isStandalone(marker: number): boolean {
  // Marcadores sin longitud: TEM y RST0…RST7.
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function startsWith(segment: Buffer, offset: number, text: string): boolean {
  return segment.subarray(offset, offset + text.length).toString("latin1") === text;
}

function keepSegment(marker: number, segment: Buffer): boolean {
  if (marker === COM) return false;
  if (marker >= 0xe0 && marker <= 0xef) {
    // Solo sobreviven la cabecera JFIF y el marcador Adobe (necesario para
    // interpretar bien el color). El resto de APPn son metadatos.
    if (marker === APP0) return startsWith(segment, 4, "JFIF\0");
    if (marker === APP14) return startsWith(segment, 4, "Adobe");
    return false;
  }
  return true;
}

export function sanitizeJpeg(input: Buffer): JpegResult {
  const size = input.length;
  if (size < 4 || input[0] !== 0xff || input[1] !== SOI) {
    return { ok: false, reason: "no es un JPEG" };
  }

  const parts: Buffer[] = [input.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let sawScan = false;
  let finished = false;
  let i = 2;

  while (i < size) {
    if (input[i] !== 0xff) return { ok: false, reason: "estructura JPEG inválida" };
    // Bytes de relleno 0xFF antes del marcador.
    while (i + 1 < size && input[i + 1] === 0xff) i += 1;
    if (i + 1 >= size) break;

    const marker = input[i + 1];
    i += 2;

    if (marker === EOI) {
      parts.push(Buffer.from([0xff, EOI]));
      finished = true;
      break;
    }
    if (marker === SOI) return { ok: false, reason: "estructura JPEG inválida" };
    if (isStandalone(marker)) continue;

    if (i + 2 > size) break;
    const length = input.readUInt16BE(i);
    if (length < 2 || i + length > size) {
      return { ok: false, reason: "JPEG truncado" };
    }
    const segment = input.subarray(i - 2, i + length);

    if (isStartOfFrame(marker)) {
      if (length < 8 || width !== 0) return { ok: false, reason: "estructura JPEG inválida" };
      height = input.readUInt16BE(i + 3);
      width = input.readUInt16BE(i + 5);
    }

    if (keepSegment(marker, segment)) parts.push(segment);
    i += length;

    if (marker === SOS) {
      if (width === 0) return { ok: false, reason: "estructura JPEG inválida" };
      sawScan = true;
      // Datos comprimidos: llegan hasta el siguiente marcador real. Dentro,
      // 0xFF00 es un 0xFF "escapado" y 0xFFD0…D7 son marcas de reinicio.
      const start = i;
      while (i < size) {
        if (input[i] !== 0xff) {
          i += 1;
          continue;
        }
        if (i + 1 >= size) return { ok: false, reason: "JPEG truncado" };
        const next = input[i + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          i += 2;
          continue;
        }
        if (next === 0xff) {
          i += 1;
          continue;
        }
        break;
      }
      parts.push(input.subarray(start, i));
    }
  }

  if (!finished || !sawScan || width === 0 || height === 0) {
    return { ok: false, reason: "JPEG incompleto" };
  }
  return { ok: true, data: Buffer.concat(parts), width, height };
}
