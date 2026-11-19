/**
 * Peticiones parciales (`Range`) para servir vídeo.
 * Safari y iOS no reproducen un <video> si el servidor no las admite.
 */

export type ByteRange = { start: number; end: number } | "unsatisfiable" | null;

/** Interpreta `Range: bytes=…` (un solo intervalo). `null` = servir entero. */
export function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  if (rawStart === "") {
    // Sufijo: los últimos N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
