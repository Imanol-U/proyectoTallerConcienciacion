"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnimationId } from "@/lib/animations";
import { deleteVideo, GenerateFailure, requestVideo } from "@/lib/generateClient";
import { DemoPaused } from "./DemoPaused";
import { StepAnimation } from "./StepAnimation";
import { type ConsentState, StepConsent } from "./StepConsent";
import { StepIntro } from "./StepIntro";
import { StepPhoto } from "./StepPhoto";
import { type Generation, StepResult } from "./StepResult";

/**
 * Asistente de 5 pasos. Todo el estado vive en el navegador (en memoria): no
 * hay cuentas, ni cookies, ni nada guardado. Al recargar la página se empieza
 * de cero.
 */

type Step = "intro" | "consent" | "photo" | "animation" | "result";

const ORDER: readonly Step[] = ["intro", "consent", "photo", "animation", "result"];

// Cada paso tiene su ancla para que el botón "atrás" del navegador (o el gesto
// del móvil) retroceda un paso en lugar de sacar al visitante de la demo.
const HASHES: Record<Step, string> = {
  intro: "",
  consent: "#permiso",
  photo: "#foto",
  animation: "#animacion",
  result: "#resultado",
};

interface Photo {
  blob: Blob;
  url: string;
}

interface Snapshot {
  consent: ConsentState;
  photo: Photo | null;
  generation: Generation | null;
}

function stepFromHash(hash: string): Step {
  return ORDER.find((step) => HASHES[step] === hash) ?? "intro";
}

/** El paso más avanzado (sin pasar de `target`) al que se puede ir con lo hecho hasta ahora. */
function reachable(target: Step, state: Snapshot): Step {
  const consented = state.consent.every(Boolean);
  const hasPhoto = consented && state.photo !== null;
  const allowed: Record<Step, boolean> = {
    intro: true,
    consent: true,
    photo: consented,
    animation: hasPhoto,
    result: hasPhoto && state.generation !== null,
  };
  for (let index = ORDER.indexOf(target); index > 0; index -= 1) {
    if (allowed[ORDER[index]]) return ORDER[index];
  }
  return "intro";
}

function setUrl(step: Step, mode: "push" | "replace") {
  const url = `${window.location.pathname}${window.location.search}${HASHES[step]}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

const NO_CONSENT: ConsentState = [false, false, false];

interface WizardProps {
  uploadEnabled: boolean;
  /** Coste medido por vídeo (euros), o `null` si no está configurado. */
  costPerVideoEur: number | null;
  /** Minutos que vive el vídeo en el servidor. */
  retentionMinutes: number;
}

export function Wizard({ uploadEnabled, costPerVideoEur, retentionMinutes }: WizardProps) {
  const [step, setStep] = useState<Step>("intro");
  const [consent, setConsent] = useState<ConsentState>(NO_CONSENT);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [animation, setAnimation] = useState<AnimationId | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const snapshot = useRef<Snapshot>({ consent, photo, generation });
  const mounted = useRef(false);

  useEffect(() => {
    snapshot.current = { consent, photo, generation };
  }, [consent, photo, generation]);

  const navigate = useCallback((next: Step, mode: "push" | "replace" = "push") => {
    setStep(next);
    setUrl(next, mode);
  }, []);

  // Botón "atrás"/"adelante" del navegador.
  useEffect(() => {
    // Tras recargar no queda estado: la URL vuelve a la portada.
    if (window.location.hash) setUrl("intro", "replace");

    const onPopState = () => {
      const wanted = stepFromHash(window.location.hash);
      const next = reachable(wanted, snapshot.current);
      if (next !== wanted) setUrl(next, "replace");
      setStep(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Si el visitante cierra o recarga la página, el vídeo se borra ya.
  useEffect(() => {
    const onPageHide = () => {
      const current = snapshot.current.generation;
      if (current?.status === "done") void deleteVideo(current.id);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Al cambiar de pantalla: arriba del todo y foco en el título.
  const generationStatus = generation?.status;
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, generationStatus]);

  /** Borra del servidor el vídeo actual, si lo hay. */
  const discardVideo = useCallback(() => {
    const current = snapshot.current.generation;
    if (current?.status === "done") void deleteVideo(current.id);
  }, []);

  function acceptPhoto(blob: Blob) {
    discardVideo();
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    setGeneration(null);
    navigate("animation");
  }

  function startGeneration() {
    if (!photo) return;
    if (generation?.status === "running") {
      navigate("result", step === "result" ? "replace" : "push");
      return;
    }
    if (!animation) return;

    discardVideo();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const chosen = animation;
    const startedAt = Date.now();
    setNotice(null);
    setGeneration({ status: "running", animation: chosen, startedAt });
    navigate("result", step === "result" ? "replace" : "push");

    requestVideo(photo.blob, chosen, controller.signal).then(
      (video) => {
        if (controller.signal.aborted) {
          void deleteVideo(video.id);
          return;
        }
        setRemaining(video.remaining);
        setGeneration({
          status: "done",
          animation: chosen,
          id: video.id,
          seconds: (Date.now() - startedAt) / 1000,
          expiresAt: Date.now() + video.ttlSeconds * 1000,
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof GenerateFailure) {
          if (error.code === "demo_off") {
            setPaused(true);
            return;
          }
          if (error.code === "limit" && error.scope === "ip") setRemaining(0);
          setGeneration({ status: "error", animation: chosen, code: error.code, message: error.message });
          return;
        }
        setGeneration({
          status: "error",
          animation: chosen,
          code: "network",
          message: "No hemos podido conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
        });
      },
    );
  }

  function tryAnother() {
    discardVideo();
    setGeneration(null);
    navigate("animation", "replace");
  }

  function changePhoto() {
    discardVideo();
    setGeneration(null);
    navigate("photo", "replace");
  }

  const markVideoGone = useCallback(() => {
    setGeneration((current) =>
      current?.status === "done" ? { status: "expired", animation: current.animation } : current,
    );
  }, []);

  async function deleteEverything() {
    setDeleting(true);
    abortRef.current?.abort();
    const current = generation;
    const confirmed = current?.status === "done" ? await deleteVideo(current.id) : true;

    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setAnimation(null);
    setGeneration(null);
    setConsent(NO_CONSENT);
    setNotice(
      confirmed
        ? "Hecho. Hemos borrado el vídeo de nuestro servidor y la foto de esta página. La copia temporal del servicio de IA caduca sola en unos minutos."
        : `No hemos podido confirmar el borrado ahora mismo, pero el vídeo se elimina solo en ${retentionMinutes} minutos como máximo. Tu foto ya no está en esta página.`,
    );
    setDeleting(false);
    navigate("intro", "replace");
  }

  if (paused) return <DemoPaused />;

  if (step === "consent") {
    return (
      <StepConsent
        value={consent}
        onChange={setConsent}
        onAccept={() => navigate("photo")}
        onBack={() => navigate("intro", "replace")}
        retentionMinutes={retentionMinutes}
        headingRef={headingRef}
      />
    );
  }

  if (step === "photo") {
    return (
      <StepPhoto
        uploadEnabled={uploadEnabled}
        onPhoto={acceptPhoto}
        onBack={() => navigate("consent", "replace")}
        headingRef={headingRef}
      />
    );
  }

  if (step === "animation" && photo) {
    return (
      <StepAnimation
        photoUrl={photo.url}
        selected={animation}
        onSelect={setAnimation}
        onGenerate={startGeneration}
        onChangePhoto={changePhoto}
        busy={generation?.status === "running"}
        remaining={remaining}
        headingRef={headingRef}
      />
    );
  }

  if (step === "result" && photo && generation) {
    return (
      <StepResult
        generation={generation}
        photoUrl={photo.url}
        costPerVideoEur={costPerVideoEur}
        retentionMinutes={retentionMinutes}
        deleting={deleting}
        onRetry={startGeneration}
        onAnother={tryAnother}
        onChangePhoto={changePhoto}
        onDeleteAll={deleteEverything}
        onVideoGone={markVideoGone}
        headingRef={headingRef}
      />
    );
  }

  return (
    <StepIntro
      onStart={() => {
        setNotice(null);
        navigate("consent");
      }}
      uploadEnabled={uploadEnabled}
      retentionMinutes={retentionMinutes}
      notice={notice}
      headingRef={headingRef}
    />
  );
}
