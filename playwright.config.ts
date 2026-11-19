import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de navegador (sección 11 del plan).
 *
 * Arrancan la aplicación ya compilada (`npm run build`) varias veces, cada una
 * con una configuración distinta, y con OpenRouter simulado (tests/support/mock-modelo.mjs):
 * no hace falta clave ni se gasta dinero.
 */

const ROOT = __dirname;
export const MOCK_DIR = path.join(ROOT, "test-results", "mock-modelo");
const FIXTURES = path.join(ROOT, "tests", "fixtures");
const MOCK_PRELOAD = pathToFileURL(path.join(ROOT, "tests", "support", "mock-modelo.mjs")).href;

export const SERVERS = {
  /** Configuración normal: cámara + subida. */
  main: "http://127.0.0.1:3211",
  /** UPLOAD_ENABLED=false → solo cámara. */
  cameraOnly: "http://127.0.0.1:3212",
  /** DEMO_ENABLED=false → demo en pausa. */
  paused: "http://127.0.0.1:3213",
  /** Vídeos que caducan a los 6 segundos, para ver la caducidad sin esperar 10 minutos. */
  shortLived: "http://127.0.0.1:3214",
} as const;

function server(url: string, env: Record<string, string> = {}) {
  return {
    command: "node .next/standalone/server.js",
    url: `${url}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore" as const,
    stderr: "pipe" as const,
    env: {
      PORT: new URL(url).port,
      HOSTNAME: "127.0.0.1",
      OPENROUTER_API_KEY: "clave-de-prueba",
      DEMO_ENABLED: "true",
      UPLOAD_ENABLED: "true",
      MAX_PER_IP_PER_DAY: "3",
      MAX_GLOBAL_PER_DAY: "1000",
      COST_PER_VIDEO_EUR: "",
      MOCK_MODELO_DIR: MOCK_DIR,
      NODE_OPTIONS: `--import=${MOCK_PRELOAD}`,
      ...env,
    },
  };
}

/** Cámara simulada de Chromium. Sin `clip`, emite una carta de ajuste (sin caras). */
function fakeCamera(clip?: string) {
  return {
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: [
        "--use-fake-device-for-media-stream",
        // Concede el permiso de cámara sin preguntar.
        "--use-fake-ui-for-media-stream",
        ...(clip ? [`--use-file-for-fake-video-capture=${path.join(FIXTURES, clip)}`] : []),
      ],
    },
  };
}

const CAMERA_SPECS = /camara-.*\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/playwright",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Un solo servidor con contadores en memoria y un OpenRouter simulado común:
  // las pruebas van una detrás de otra.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: SERVERS.main,
    locale: "es-ES",
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: [
    server(SERVERS.main),
    server(SERVERS.cameraOnly, { UPLOAD_ENABLED: "false" }),
    server(SERVERS.paused, { DEMO_ENABLED: "false" }),
    server(SERVERS.shortLived, { VIDEO_TTL_SECONDS: "6" }),
  ],
  projects: [
    {
      name: "escritorio",
      testIgnore: CAMERA_SPECS,
      use: { ...devices["Desktop Chrome"], ...fakeCamera("camara-cara.mjpeg") },
    },
    {
      name: "movil",
      testMatch: /flujo-completo\.spec\.ts/,
      use: { ...devices["Pixel 7"], ...fakeCamera("camara-cara.mjpeg") },
    },
    {
      name: "camara-sin-cara",
      testMatch: /camara-sin-cara\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...fakeCamera() },
    },
    {
      name: "camara-dos-caras",
      testMatch: /camara-dos-caras\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...fakeCamera("camara-dos-caras.mjpeg") },
    },
  ],
});
