/**
 * Lista blanca de animaciones.
 *
 * Es la única fuente de verdad: el cliente la usa para pintar las tarjetas y
 * el servidor para validar el campo `animation`. El visitante solo puede
 * elegir uno de estos identificadores: la instrucción que recibe el modelo
 * para cada uno es fija y vive en el servidor (lib/prompts.ts).
 */

export type AnimationId = "saludo" | "sonrisa" | "sorpresa" | "guino" | "teletransporte" | "escenario";

export interface AnimationInfo {
  /** Nombre visible en la tarjeta. */
  label: string;
  /** Gesto que hace la cara. */
  description: string;
  /** Duración del vídeo que se pide, en segundos (nunca más de MAX_VIDEO_SECONDS). */
  seconds: number;
  /** Miniatura en bucle dentro de `public/previews`. */
  preview: string;
  /**
   * Cómo usa el modelo la foto:
   *  - "first_frame": el vídeo arranca en la foto y la anima (gestos).
   *  - "reference": la foto solo guía la identidad; el vídeo arranca ya en
   *    otra escena, con otro modelo (ver sceneVideoModel en lib/config.ts).
   */
  photoUse: "first_frame" | "reference";
}

export const ANIMATIONS: Readonly<Record<AnimationId, AnimationInfo>> = {
  saludo: {
    label: "Saludo",
    description: "Asentir y sonreír",
    seconds: 4,
    preview: "/previews/saludo.mp4",
    photoUse: "first_frame",
  },
  sonrisa: {
    label: "Sonrisa",
    description: "De serio a sonrisa amplia",
    seconds: 4,
    preview: "/previews/sonrisa.mp4",
    photoUse: "first_frame",
  },
  sorpresa: {
    label: "Sorpresa",
    description: "Cejas arriba, boca abierta",
    seconds: 4,
    preview: "/previews/sorpresa.mp4",
    photoUse: "first_frame",
  },
  guino: {
    label: "Guiño",
    description: "Guiño y giro leve de cabeza",
    seconds: 5,
    preview: "/previews/guino.mp4",
    photoUse: "first_frame",
  },
  teletransporte: {
    label: "Teletransporte",
    description: "En una ciudad donde nunca estuviste",
    // Con la foto como referencia, el modelo admite 10 s como máximo.
    seconds: 10,
    preview: "/previews/teletransporte.mp4",
    photoUse: "reference",
  },
  escenario: {
    label: "Bajo los focos",
    description: "En un escenario ante miles",
    seconds: 10,
    preview: "/previews/escenario.mp4",
    photoUse: "reference",
  },
};

export const ANIMATION_IDS = Object.keys(ANIMATIONS) as AnimationId[];

/**
 * Comprueba que el valor es una clave PROPIA de la lista blanca.
 * (El operador `in` daría por buenos "constructor" o "toString".)
 */
export function isAnimationId(value: unknown): value is AnimationId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ANIMATIONS, value)
  );
}
