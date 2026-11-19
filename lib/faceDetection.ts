/**
 * Detección facial EN EL NAVEGADOR (MediaPipe, modelo BlazeFace).
 *
 * Sirve para dos salvaguardas: rechazar fotos sin cara y rechazar fotos con
 * más de una persona. Todo se ejecuta en el dispositivo del visitante: el
 * motor (WebAssembly) y el modelo se sirven desde nuestro propio dominio y la
 * imagen no sale del navegador para hacer esta comprobación.
 */

import type { FaceDetector } from "@mediapipe/tasks-vision";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/models/blaze_face_short_range.tflite";

/** Cara detectada, en fracciones (0–1) del ancho y alto de la imagen analizada. */
export interface DetectedFace {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

/**
 * MediaPipe escribe sus mensajes informativos ("INFO: Created TensorFlow Lite
 * XNNPACK delegate for CPU.") por el canal de errores de la consola. No son
 * errores, pero en desarrollo Next.js los cuenta como tales. Mientras trabaja
 * el detector se descartan esas líneas, y solo esas.
 */
function withoutInfoNoise<T>(work: () => T): T {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
    original(...args);
  };
  const restore = () => {
    console.error = original;
  };
  try {
    const result = work();
    if (result instanceof Promise) return result.finally(restore) as T;
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

let detectorPromise: Promise<FaceDetector> | null = null;

/** Descarga y prepara el detector (una sola vez por visita). */
export function loadFaceDetector(): Promise<FaceDetector> {
  detectorPromise ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    return withoutInfoNoise(() =>
      FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      }),
    );
  })();
  // Si falla (sin red, navegador sin WebAssembly…), se podrá reintentar.
  detectorPromise.catch(() => {
    detectorPromise = null;
  });
  return detectorPromise;
}

/** Devuelve las caras que hay en el lienzo. */
export async function detectFaces(canvas: HTMLCanvasElement): Promise<DetectedFace[]> {
  const detector = await loadFaceDetector();
  const { width, height } = canvas;
  if (width === 0 || height === 0) return [];

  const faces: DetectedFace[] = [];
  for (const detection of withoutInfoNoise(() => detector.detect(canvas)).detections) {
    const box = detection.boundingBox;
    if (!box) continue;
    faces.push({
      x: box.originX / width,
      y: box.originY / height,
      width: box.width / width,
      height: box.height / height,
      score: detection.categories[0]?.score ?? 0,
    });
  }
  return faces;
}

export type FaceCheck = "ok" | "none" | "many";

export function checkFaces(faces: DetectedFace[]): FaceCheck {
  if (faces.length === 0) return "none";
  return faces.length === 1 ? "ok" : "many";
}

export const FACE_MESSAGES: Record<Exclude<FaceCheck, "ok">, { title: string; body: string }> = {
  none: {
    title: "No vemos ninguna cara",
    body: "Hace falta una foto en la que se vea bien tu cara, de frente y con buena luz.",
  },
  many: {
    title: "Usa una foto en la que solo salgas tú",
    body: "Hemos detectado más de una cara. La demo solo funciona con tu propia cara, sin nadie más en la imagen.",
  },
};
