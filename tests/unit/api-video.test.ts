import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET } from "@/app/api/video/[id]/route";
import { parseRange } from "@/lib/range";
import { clearTempForTests, countTemp, saveTemp } from "@/lib/tempStore";

const VIDEO = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function get(id: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/video/${id}`, { headers }), context(id));
}

function del(id: string, headers: Record<string, string> = {}) {
  return DELETE(new Request(`http://localhost/api/video/${id}`, { method: "DELETE", headers }), context(id));
}

describe("/api/video/{id}", () => {
  beforeEach(async () => {
    delete process.env.VIDEO_TTL_SECONDS;
    await clearTempForTests();
  });

  afterEach(async () => {
    await clearTempForTests();
  });

  it("sirve el mp4 completo con cabeceras que impiden cachearlo", async () => {
    const id = await saveTemp(VIDEO);
    const response = await get(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe("1000");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(VIDEO);
  });

  it("admite peticiones parciales (Safari/iOS las exige)", async () => {
    const id = await saveTemp(VIDEO);

    const probe = await get(id, { range: "bytes=0-1" });
    expect(probe.status).toBe(206);
    expect(probe.headers.get("content-range")).toBe("bytes 0-1/1000");
    expect(probe.headers.get("content-length")).toBe("2");
    expect(Buffer.from(await probe.arrayBuffer())).toEqual(VIDEO.subarray(0, 2));

    const tail = await get(id, { range: "bytes=900-" });
    expect(tail.status).toBe(206);
    expect(tail.headers.get("content-range")).toBe("bytes 900-999/1000");
    expect(Buffer.from(await tail.arrayBuffer())).toEqual(VIDEO.subarray(900));

    const suffix = await get(id, { range: "bytes=-100" });
    expect(suffix.headers.get("content-range")).toBe("bytes 900-999/1000");

    const beyond = await get(id, { range: "bytes=500-99999" });
    expect(beyond.headers.get("content-range")).toBe("bytes 500-999/1000");

    const invalid = await get(id, { range: "bytes=2000-" });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */1000");
  });

  it("interpreta bien las cabeceras Range", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=50-40", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
    // Formatos que no se admiten: se sirve el fichero entero.
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
    expect(parseRange("bytes=-", 100)).toBeNull();
  });

  it("id desconocido o mal formado → 404", async () => {
    await saveTemp(VIDEO);
    for (const id of ["00000000-0000-4000-8000-000000000000", "nada", "..", "../../etc/passwd"]) {
      const response = await get(id);
      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe("not_found");
    }
  });

  it("'Borrar mis datos ahora': DELETE → 204 y el vídeo deja de existir", async () => {
    const id = await saveTemp(VIDEO);
    const response = await del(id);
    expect(response.status).toBe(204);
    expect(countTemp()).toBe(0);
    expect((await get(id)).status).toBe(404);
    // Repetir el borrado no es un error.
    expect((await del(id)).status).toBe(204);
    expect((await del("nada")).status).toBe(204);
  });

  it("otra web no puede borrar vídeos", async () => {
    const id = await saveTemp(VIDEO);
    const response = await del(id, { "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect((await get(id)).status).toBe(200);
  });

  it("pasado el tiempo de vida, /api/video/{id} devuelve 404", async () => {
    process.env.VIDEO_TTL_SECONDS = "1";
    const id = await saveTemp(VIDEO);
    expect((await get(id)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect((await get(id)).status).toBe(404);
    expect(countTemp()).toBe(0);
  });
});
