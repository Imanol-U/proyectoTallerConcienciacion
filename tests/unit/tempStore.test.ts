import { existsSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTempForTests,
  countTemp,
  deleteTemp,
  getTempTtl,
  isValidTempId,
  readTemp,
  saveTemp,
} from "@/lib/tempStore";

function storeDir(): string {
  const state = (globalThis as { __eresTuTempStore?: { dir: string } }).__eresTuTempStore;
  if (!state) throw new Error("el almacén no se ha inicializado");
  return state.dir;
}

function filesOnDisk(): string[] {
  return existsSync(storeDir()) ? readdirSync(storeDir()) : [];
}

describe("almacén temporal", () => {
  beforeEach(async () => {
    delete process.env.VIDEO_TTL_SECONDS;
    await clearTempForTests();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await clearTempForTests();
  });

  it("guarda y devuelve el vídeo con un id imposible de adivinar", async () => {
    const data = Buffer.from("vídeo marcado");
    const id = await saveTemp(data);
    expect(isValidTempId(id)).toBe(true);
    expect(await readTemp(id)).toEqual(data);
    expect(filesOnDisk()).toEqual([`${id}.mp4`]);

    const other = await saveTemp(data);
    expect(other).not.toBe(id);
  });

  it("borra a petición y no deja nada en disco", async () => {
    const id = await saveTemp(Buffer.from("x"));
    expect(await deleteTemp(id)).toBe(true);
    expect(await readTemp(id)).toBeNull();
    expect(filesOnDisk()).toEqual([]);
    expect(await deleteTemp(id)).toBe(false);
  });

  it("caduca a los 10 minutos", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const id = await saveTemp(Buffer.from("x"));
    expect(getTempTtl(id)).toBe(600);

    await vi.advanceTimersByTimeAsync(9 * 60 * 1000 + 59_000);
    expect(await readTemp(id)).not.toBeNull();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(await readTemp(id)).toBeNull();
    expect(getTempTtl(id)).toBeNull();
    expect(countTemp()).toBe(0);
    vi.useRealTimers();
    await vi.waitFor(() => expect(filesOnDisk()).toEqual([]));
  });

  it("la caducidad manda aunque el temporizador no haya saltado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const id = await saveTemp(Buffer.from("x"));
    vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    expect(await readTemp(id)).toBeNull();
    expect(filesOnDisk()).toEqual([]);
  });

  it("nunca conserva más de 10 minutos aunque se configure más", async () => {
    process.env.VIDEO_TTL_SECONDS = "86400";
    const id = await saveTemp(Buffer.from("x"));
    expect(getTempTtl(id)).toBeLessThanOrEqual(600);
  });

  it("ignora identificadores con formato raro", async () => {
    await saveTemp(Buffer.from("x"));
    for (const bad of ["", "..", "../../etc/passwd", "abc", "%2e%2e", "x".repeat(36)]) {
      expect(isValidTempId(bad)).toBe(false);
      expect(await readTemp(bad)).toBeNull();
      expect(await deleteTemp(bad)).toBe(false);
    }
    expect(countTemp()).toBe(1);
  });
});
