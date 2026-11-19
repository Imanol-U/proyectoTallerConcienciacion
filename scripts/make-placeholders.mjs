#!/usr/bin/env node
/**
 * Genera las miniaturas en bucle de las seis animaciones (public/previews):
 * una cara esquemática dibujada que hace cada gesto o escena.
 *
 *   node scripts/make-placeholders.mjs                    (todas)
 *   node scripts/make-placeholders.mjs escenario ...      (solo esas)
 *
 * Son solo ilustraciones para las tarjetas del paso 4; el modelo no las usa.
 * Requiere ffmpeg y Playwright (ya instalado para las pruebas de navegador).
 */
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewDir = path.join(root, "public", "previews");

const SIZE = 512;
const FPS = 25;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Transición suave de 0 a 1 entre los instantes `a` y `b`. */
const ease = (t, a, b) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
/** Sube entre a→b y vuelve a bajar entre c→d. */
const pulse = (t, a, b, c, d) => ease(t, a, b) * (1 - ease(t, c, d));

// Cada gesto empieza en expresión neutra (primer fotograma), igual que deben
// hacerlo las grabaciones reales.
const GESTURES = {
  saludo: {
    seconds: 4,
    label: "SALUDO",
    pose: (t) => ({
      nod: 16 * (pulse(t, 0.5, 0.9, 0.9, 1.3) + pulse(t, 1.5, 1.9, 1.9, 2.3)),
      smile: ease(t, 0.8, 2.2),
    }),
  },
  sonrisa: {
    seconds: 4,
    label: "SONRISA",
    pose: (t) => ({ smile: ease(t, 0.8, 2.6), brow: 0.25 * ease(t, 1.4, 2.6) }),
  },
  sorpresa: {
    seconds: 4,
    label: "SORPRESA",
    pose: (t) => ({
      brow: pulse(t, 0.6, 1.1, 3.0, 3.7),
      open: pulse(t, 0.7, 1.2, 3.0, 3.7),
      eyes: 1 + 0.35 * pulse(t, 0.6, 1.1, 3.0, 3.7),
    }),
  },
  guino: {
    seconds: 5,
    label: "GUIÑO",
    pose: (t) => ({
      wink: pulse(t, 1.2, 1.5, 2.0, 2.4),
      tilt: 9 * pulse(t, 0.8, 1.6, 3.2, 4.2),
      smile: 0.7 * pulse(t, 0.9, 1.6, 3.4, 4.4),
    }),
  },
  // Las escenas duran 12 s en el modelo; la miniatura resume la idea en 4 s.
  teletransporte: {
    seconds: 4,
    label: "TELETRANSPORTE",
    pose: (t) => ({
      scene: pulse(t, 0.5, 1.6, 3.4, 3.95),
      turn: Math.sin(Math.max(0, t - 1.6) * 3.2) * ease(t, 1.6, 2.0) * (1 - ease(t, 3.0, 3.4)),
      eyes: 1 + 0.3 * pulse(t, 0.4, 0.8, 2.8, 3.4),
      smile: 0.8 * pulse(t, 2.4, 2.9, 3.4, 3.9),
      t,
    }),
  },
  escenario: {
    seconds: 4,
    label: "BAJO LOS FOCOS",
    pose: (t) => ({
      beams: pulse(t, 0.3, 1.0, 3.5, 3.95),
      arms: pulse(t, 1.4, 2.0, 3.2, 3.8),
      confetti: pulse(t, 1.0, 1.4, 3.5, 3.95),
      smile: pulse(t, 1.0, 1.6, 3.4, 3.9),
      nod: 8 * Math.sin(t * 9) * pulse(t, 2.0, 2.2, 3.0, 3.3),
      t,
    }),
  },
};

/** Fondo y efectos de las escenas (teletransporte y escenario). */
function sceneSvg({ scene = 0, beams = 0, confetti = 0, t = 0 }) {
  const parts = [];
  if (scene > 0) {
    parts.push(`<rect width="512" height="512" fill="url(#neon)" opacity="${scene}"/>`);
    // Partículas de luz que suben mientras cambia el sitio.
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 97) % 512;
      const y = 512 - ((i * 53 + t * 140) % 560);
      parts.push(`<circle cx="${x}" cy="${y}" r="${3 + (i % 3)}" fill="#ffd6f5" opacity="${0.8 * scene}"/>`);
    }
  }
  if (beams > 0) {
    for (const [x, angle] of [[90, 18], [256, 0], [422, -18]]) {
      const sweep = angle + 12 * Math.sin(t * 2 + x);
      parts.push(`<polygon points="${x - 14},0 ${x + 14},0 ${x + 120},512 ${x - 120},512" fill="#fff3c4" opacity="${0.22 * beams}" transform="rotate(${sweep} ${x} 0)"/>`);
    }
  }
  if (confetti > 0) {
    const colors = ["#ffd23f", "#f4f1ea", "#ff5e8a", "#4cc9f0"];
    for (let i = 0; i < 26; i += 1) {
      const x = (i * 71) % 512;
      const y = ((i * 37 + t * 160) % 540) - 20;
      parts.push(`<rect x="${x}" y="${y}" width="8" height="4" fill="${colors[i % 4]}" opacity="${confetti}" transform="rotate(${(i * 40 + t * 200) % 360} ${x + 4} ${y + 2})"/>`);
    }
  }
  return parts.join("");
}

function faceSvg({ nod = 0, tilt = 0, smile = 0, open = 0, brow = 0, wink = 0, eyes = 1, turn = 0, arms = 0, ...scene }, label) {
  const ink = "#f4f1ea";
  // Giro de cabeza: los rasgos se desplazan en horizontal.
  const dx = 34 * turn;
  const browY = 196 - 20 * brow;
  const eyeRy = 11 * eyes;
  const leftEyeRy = Math.max(0.8, eyeRy * (1 - wink));
  const mouthY = 318;
  // Boca: línea que se curva al sonreír, u óvalo al abrirse.
  const curve = 30 * smile;
  const half = 44 + 12 * smile;
  const mouth =
    open > 0.02
      ? `<ellipse cx="256" cy="${mouthY + 6 * open}" rx="${34 - 8 * open}" ry="${4 + 30 * open}" />`
      : `<path d="M${256 - half} ${mouthY - curve * 0.35} Q256 ${mouthY + curve} ${256 + half} ${mouthY - curve * 0.35}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <defs><linearGradient id="neon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a0ca3"/><stop offset="0.55" stop-color="#b5179e"/><stop offset="1" stop-color="#4361ee"/></linearGradient></defs>
  <rect width="512" height="512" fill="#1c1c24"/>
  ${sceneSvg(scene)}
  <g fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M96 512c10-86 76-128 160-128s150 42 160 128" opacity="0.75"/>
    ${arms > 0 ? `<path d="M120 440L${120 - 40 * arms} ${440 - 300 * arms}M392 440L${392 + 40 * arms} ${440 - 300 * arms}" opacity="${0.4 + 0.5 * arms}"/>` : ""}
    <g transform="translate(0 ${nod}) rotate(${tilt} 256 300)">
      <ellipse cx="256" cy="250" rx="118" ry="156" fill="#24242e"/>
      <g transform="translate(${dx} 0)">
      <path d="M190 ${browY}q24 -12 48 0M274 ${browY}q24 -12 48 0"/>
      <ellipse cx="214" cy="232" rx="17" ry="${leftEyeRy}" fill="${ink}"/>
      <ellipse cx="298" cy="232" rx="17" ry="${eyeRy}" fill="${ink}"/>
      <path d="M256 250v34q-8 10 -18 8" opacity="0.7"/>
      ${mouth}
      </g>
    </g>
  </g>
  <text x="256" y="494" text-anchor="middle" font-family="monospace" font-size="20" font-weight="700" fill="${ink}" letter-spacing="5" opacity="0.8">${label}</text>
</svg>`;
}

function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      stdio: [input ? "pipe" : "ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: código ${code}`))));
    if (input) {
      child.stdin.on("error", () => {});
      input(child.stdin).then(() => child.stdin.end(), reject);
    }
  });
}

const VIDEO_ARGS = ["-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1"];

await mkdir(previewDir, { recursive: true });

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });

const only = process.argv.slice(2);
for (const [id, gesture] of Object.entries(GESTURES)) {
  if (only.length > 0 && !only.includes(id)) continue;
  const frames = gesture.seconds * FPS;
  const driving = path.join(tmpdir(), `eres-tu-miniatura-${id}.mp4`);

  await ffmpeg(
    ["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-r", String(FPS), ...VIDEO_ARGS,
      driving],
    async (stdin) => {
      for (let frame = 0; frame < frames; frame += 1) {
        const svg = faceSvg(gesture.pose(frame / FPS), gesture.label);
        await page.setContent(`<body style="margin:0;background:#1c1c24">${svg}</body>`);
        const png = await page.screenshot({ type: "png" });
        if (!stdin.write(png)) await new Promise((resolve) => stdin.once("drain", resolve));
      }
    },
  );

  await ffmpeg(["-i", driving, "-vf", "scale=256:256", ...VIDEO_ARGS, "-crf", "28",
    path.join(previewDir, `${id}.mp4`)]);
  await rm(driving, { force: true });
  console.log(`✓ ${id}: ${frames} fotogramas (${gesture.seconds} s)`);
}

await browser.close();

console.log("Miniaturas generadas en public/previews.");
