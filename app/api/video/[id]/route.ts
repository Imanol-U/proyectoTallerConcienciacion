import { errorOutcome, isSameOrigin, NO_STORE, respond } from "@/lib/http";
import { parseRange } from "@/lib/range";
import { deleteTemp, isValidTempId, readTemp } from "@/lib/tempStore";

/**
 * GET    /api/video/{id} — sirve el mp4 CON marca de agua (único vídeo que existe).
 * DELETE /api/video/{id} — "Borrar mis datos ahora".
 *
 * El id es aleatorio e imposible de adivinar y deja de valer a los 10 minutos.
 */

type Context = { params: Promise<{ id: string }> };

const VIDEO_HEADERS = {
  ...NO_STORE,
  "Content-Type": "video/mp4",
  "Accept-Ranges": "bytes",
  // Se ve dentro de la página; no se ofrece como descarga.
  "Content-Disposition": "inline",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET(req: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  const video = isValidTempId(id) ? await readTemp(id) : null;
  if (!video) return respond(errorOutcome(404, "not_found"));

  const range = parseRange(req.headers.get("range"), video.length);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...VIDEO_HEADERS, "Content-Range": `bytes */${video.length}` },
    });
  }
  if (range) {
    const chunk = video.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...VIDEO_HEADERS,
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${video.length}`,
      },
    });
  }
  return new Response(new Uint8Array(video), {
    status: 200,
    headers: { ...VIDEO_HEADERS, "Content-Length": String(video.length) },
  });
}

export async function DELETE(req: Request, { params }: Context): Promise<Response> {
  if (!isSameOrigin(req)) return respond(errorOutcome(403, "forbidden"));
  const { id } = await params;
  if (isValidTempId(id)) await deleteTemp(id);
  // Misma respuesta exista o no: borrar dos veces no es un error.
  return new Response(null, { status: 204, headers: NO_STORE });
}
