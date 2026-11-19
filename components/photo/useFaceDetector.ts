"use client";

import { useCallback, useEffect, useState } from "react";
import { loadFaceDetector } from "@/lib/faceDetection";

export type DetectorStatus = "loading" | "ready" | "error";

/**
 * Carga el detector de caras y cuenta en qué estado está.
 * Si no se puede cargar, no se acepta ninguna foto: sin él no podríamos
 * comprobar que en la imagen hay una sola persona.
 */
export function useFaceDetector(): { status: DetectorStatus; retry: () => void } {
  const [status, setStatus] = useState<DetectorStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadFaceDetector().then(
      () => {
        if (!cancelled) setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((value) => value + 1);
  }, []);

  return { status, retry };
}
