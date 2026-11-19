import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getConfig, RETENTION_SECONDS } from "./config";

/**
 * Almacén temporal de los vídeos YA MARCADOS.
 *
 * - Cada vídeo es un fichero en el disco temporal, con un identificador
 *   aleatorio imposible de adivinar. El índice vive solo en memoria.
 * - Se borra solo a los 10 minutos (o antes, si el visitante pulsa
 *   "Borrar mis datos ahora").
 * - No hay base de datos ni copia: si el proceso se reinicia, los vídeos
 *   dejan de ser accesibles y el directorio se limpia.
 */

interface Entry {
  file: string;
  size: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

interface TempState {
  dir: string;
  entries: Map<string, Entry>;
  prepared: Promise<void> | null;
}

const BASE_DIR = path.join(tmpdir(), "eres-tu");
/** Los directorios de procesos anteriores se dan por huérfanos pasado este tiempo. */
const STALE_MS = (RETENTION_SECONDS + 300) * 1000;

const globalStore = globalThis as typeof globalThis & {
  __eresTuTempStore?: TempState;
};

function getState(): TempState {
  if (!globalStore.__eresTuTempStore) {
    const state: TempState = {
      dir: path.join(BASE_DIR, `p${process.pid}-${randomBytes(6).toString("hex")}`),
      entries: new Map(),
      prepared: null,
    };
    globalStore.__eresTuTempStore = state;
    // Al terminar el proceso no debe quedar nada en disco.
    process.once("exit", () => {
      try {
        rmSync(state.dir, { recursive: true, force: true });
      } catch {
        // Nada que hacer: el contenedor se destruye de todos modos.
      }
    });
  }
  return globalStore.__eresTuTempStore;
}

/** Borra restos de procesos anteriores que no pudieron limpiar (caídas). */
async function purgeStaleDirs(ownDir: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(BASE_DIR);
  } catch {
    return;
  }
  const now = Date.now();
  await Promise.all(
    names.map(async (name) => {
      const dir = path.join(BASE_DIR, name);
      if (dir === ownDir) return;
      try {
        const info = await stat(dir);
        if (now - info.mtimeMs > STALE_MS) {
          await rm(dir, { recursive: true, force: true });
        }
      } catch {
        // Otro proceso lo ha borrado antes: perfecto.
      }
    }),
  );
}

async function prepare(state: TempState): Promise<void> {
  state.prepared ??= purgeStaleDirs(state.dir);
  await state.prepared;
  await mkdir(state.dir, { recursive: true, mode: 0o700 });
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isValidTempId(id: unknown): id is string {
  return typeof id === "string" && ID_PATTERN.test(id);
}

/** Guarda un vídeo marcado y devuelve su identificador. */
export async function saveTemp(data: Buffer): Promise<string> {
  const state = getState();
  await prepare(state);

  const id = randomUUID();
  const file = path.join(state.dir, `${id}.mp4`);
  await writeFile(file, data, { mode: 0o600, flag: "wx" });

  const ttlMs = getConfig().videoTtlSeconds * 1000;
  const timer = setTimeout(() => void deleteTemp(id), ttlMs);
  timer.unref();
  state.entries.set(id, { file, size: data.length, expiresAt: Date.now() + ttlMs, timer });
  return id;
}

/** Segundos de vida que le quedan a un vídeo, o `null` si ya no existe. */
export function getTempTtl(id: string): number | null {
  const entry = getState().entries.get(id);
  if (!entry) return null;
  const left = entry.expiresAt - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : null;
}

/** Lee un vídeo. Devuelve `null` si no existe o ha caducado. */
export async function readTemp(id: string): Promise<Buffer | null> {
  if (!isValidTempId(id)) return null;
  const entry = getState().entries.get(id);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    // El temporizador puede ir con retraso: la caducidad manda.
    await deleteTemp(id);
    return null;
  }
  try {
    return await readFile(entry.file);
  } catch {
    await deleteTemp(id);
    return null;
  }
}

/** Borra un vídeo. Devuelve `true` si existía. */
export async function deleteTemp(id: string): Promise<boolean> {
  if (!isValidTempId(id)) return false;
  const state = getState();
  const entry = state.entries.get(id);
  if (!entry) return false;
  state.entries.delete(id);
  clearTimeout(entry.timer);
  await rm(entry.file, { force: true });
  return true;
}

/** Número de vídeos guardados ahora mismo (para diagnósticos y pruebas). */
export function countTemp(): number {
  return getState().entries.size;
}

/** Borra todo. Solo para pruebas. */
export async function clearTempForTests(): Promise<void> {
  const state = getState();
  for (const entry of state.entries.values()) clearTimeout(entry.timer);
  state.entries.clear();
  await rm(state.dir, { recursive: true, force: true });
}
