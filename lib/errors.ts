/**
 * Códigos de error de la API y el mensaje que ve el visitante.
 * Lo usan el servidor (campo `message` de las respuestas) y la interfaz.
 */

export type ApiErrorCode =
  | "demo_off"
  | "forbidden"
  | "limit"
  | "bad_request"
  | "consent"
  | "animation"
  | "photo"
  | "no_face"
  | "rejected"
  | "busy"
  | "unavailable"
  | "internal"
  | "not_found";

export interface ApiErrorBody {
  error: ApiErrorCode;
  message: string;
  /** Solo con `limit`: qué tope se ha alcanzado. */
  scope?: "ip" | "global";
}

export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  demo_off: "La demo está en pausa. Vuelve a intentarlo más tarde.",
  forbidden: "Esta petición no viene de la propia web de la demo.",
  limit: "Has llegado al límite de vídeos por hoy. Vuelve mañana: la demo seguirá aquí.",
  bad_request: "No hemos entendido la petición.",
  consent: "Para generar el vídeo tienes que aceptar las tres casillas de consentimiento.",
  animation: "Esa animación no existe. Elige una de las seis disponibles.",
  photo: "La foto no es válida. Tiene que ser un JPEG de 512×512 píxeles y menos de 2 MB.",
  no_face:
    "No hemos encontrado una cara clara en la foto. Prueba con otra en la que se te vea de frente y con buena luz.",
  rejected:
    "El modelo no ha podido usar esta foto. Prueba con otra en la que solo salgas tú, de frente y con buena luz.",
  busy: "El servicio de IA va lento o no responde ahora mismo. Inténtalo de nuevo en un momento: este intento no cuenta.",
  unavailable: "La demo no está disponible en este momento. Inténtalo de nuevo más tarde: este intento no cuenta.",
  internal: "Algo ha fallado por nuestra parte al preparar el vídeo. Inténtalo de nuevo: este intento no cuenta.",
  not_found: "Este vídeo ya no existe: se borra solo a los pocos minutos.",
};

export function limitMessage(scope: "ip" | "global", maxPerIp: number): string {
  if (scope === "global") {
    return "La demo ha alcanzado su tope de vídeos por hoy. Vuelve mañana: seguirá aquí.";
  }
  const videos = maxPerIp === 1 ? "1 vídeo" : `${maxPerIp} vídeos`;
  return `Has llegado al límite de ${videos} por día. Vuelve mañana: la demo seguirá aquí.`;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  );
}
