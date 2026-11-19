"use client";

import { useEffect, useId, useRef, useState } from "react";
import { checkFaces, type DetectedFace, detectFaces, FACE_MESSAGES, type FaceCheck } from "@/lib/faceDetection";
import { canvasToJpeg, captureVideoFrame, centerCrop, createCanvas, drawCrop } from "@/lib/photo";
import { Button, cx, Notice } from "../ui";
import type { DetectorStatus } from "./useFaceDetector";

type CameraProblem = "denied" | "notfound" | "busy" | "unsupported" | "other";

function classifyCameraError(error: unknown): CameraProblem {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "notfound";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "other";
}

type Hint = "searching" | "many" | "closer" | "farther" | "center" | "good";

const HINTS: Record<Hint, string> = {
  searching: "Coloca tu cara dentro del óvalo y mira a la cámara.",
  many: "Solo puede salir una persona en la foto.",
  closer: "Acércate un poco.",
  farther: "Aléjate un poco.",
  center: "Centra tu cara en el óvalo.",
  good: "Perfecto. Mira a la cámara y pulsa «Hacer foto».",
};

function hintFor(faces: DetectedFace[]): Hint {
  if (faces.length === 0) return "searching";
  if (faces.length > 1) return "many";
  const [face] = faces;
  if (face.height < 0.26) return "closer";
  if (face.height > 0.74) return "farther";
  const centerX = face.x + face.width / 2;
  const centerY = face.y + face.height / 2;
  if (Math.abs(centerX - 0.5) > 0.17 || Math.abs(centerY - 0.48) > 0.19) return "center";
  return "good";
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Óvalo guía: oscurece lo de fuera y cambia de color según lo que ve el detector. */
function OvalGuide({ hint }: { hint: Hint }) {
  const maskId = useId();
  const stroke = hint === "good" ? "var(--color-ok)" : hint === "many" ? "var(--color-warn)" : "var(--color-paper)";
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          <ellipse cx="50" cy="47" rx="27" ry="36" fill="black" />
        </mask>
      </defs>
      <rect width="100" height="100" fill="rgb(11 11 14 / 0.55)" mask={`url(#${maskId})`} />
      <ellipse
        cx="50"
        cy="47"
        rx="27"
        ry="36"
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeDasharray={hint === "good" ? undefined : "10 8"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PermissionHelp({ problem }: { problem: CameraProblem }) {
  if (problem === "denied") {
    return (
      <Notice tone="warn" role="alert" title="No tenemos permiso para usar la cámara" testId="camara-sin-permiso">
        <p>Para activarlo:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Pulsa el icono del candado (o de la cámara) que hay junto a la dirección de esta página.</li>
          <li>
            En <strong>Cámara</strong>, elige <strong>Permitir</strong>.
          </li>
          <li>
            Vuelve aquí y pulsa <strong>Reintentar</strong>.
          </li>
        </ol>
        <p className="mt-3 text-sm">
          En iPhone: Ajustes → Safari → Cámara → Permitir. Si has abierto la demo desde otra aplicación
          (Instagram, WhatsApp…), ábrela directamente en Safari o Chrome.
        </p>
      </Notice>
    );
  }
  const messages: Record<Exclude<CameraProblem, "denied">, { title: string; body: string }> = {
    notfound: {
      title: "No encontramos ninguna cámara",
      body: "Este dispositivo no tiene cámara o no está conectada. Conéctala y pulsa «Reintentar».",
    },
    busy: {
      title: "La cámara está ocupada",
      body: "Otra aplicación la está usando. Ciérrala y pulsa «Reintentar».",
    },
    unsupported: {
      title: "Este navegador no deja usar la cámara aquí",
      body: "Hace falta un navegador actualizado y una conexión segura (https). Prueba a abrir la demo en Chrome, Safari o Firefox.",
    },
    other: {
      title: "No hemos podido encender la cámara",
      body: "Pulsa «Reintentar». Si sigue sin funcionar, prueba con otro navegador.",
    },
  };
  const { title, body } = messages[problem];
  return (
    <Notice tone="warn" role="alert" title={title} testId="camara-error">
      {body}
    </Notice>
  );
}

interface CameraPanelProps {
  detector: DetectorStatus;
  onPhoto: (photo: Blob) => void;
  /** Ofrece pasar a "Subir foto" cuando la cámara no funciona. */
  onSwitchToUpload?: () => void;
}

export function CameraPanel({ detector, onPhoto, onSwitchToUpload }: CameraPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [session, setSession] = useState(0);
  const [phase, setPhase] = useState<"starting" | "live" | "error">("starting");
  const [cameraProblem, setCameraProblem] = useState<CameraProblem | null>(null);
  const [hint, setHint] = useState<Hint>("searching");
  const [faceProblem, setFaceProblem] = useState<Exclude<FaceCheck, "ok"> | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reviewing = shot !== null;

  // Encender la cámara (y apagarla al salir de la pestaña, del paso o de la página).
  useEffect(() => {
    if (reviewing) return;
    const video = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;

    const fail = (problem: CameraProblem) => {
      if (cancelled) return;
      setCameraProblem(problem);
      setPhase("error");
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        fail("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Nunca se pide el micrófono.
          audio: false,
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (error) {
        fail(classifyCameraError(error));
        return;
      }
      if (cancelled) {
        stopStream(stream);
        return;
      }
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      if (!cancelled) setPhase("live");
    })();

    return () => {
      cancelled = true;
      stopStream(stream);
      if (video) video.srcObject = null;
    };
  }, [session, reviewing]);

  // Pistas en vivo: ¿hay una cara, y está bien colocada?
  useEffect(() => {
    if (phase !== "live" || detector !== "ready" || reviewing) return;
    const scratch = createCanvas(192);
    let stopped = false;
    let working = false;

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || working || document.hidden || !video || video.readyState < 2 || !video.videoWidth) return;
      working = true;
      try {
        drawCrop(scratch, video, centerCrop(video.videoWidth, video.videoHeight));
        const faces = await detectFaces(scratch);
        if (!stopped) setHint(hintFor(faces));
      } catch {
        // Un fotograma fallido no importa: se reintenta en el siguiente.
      } finally {
        working = false;
      }
    };

    const timer = setInterval(tick, 450);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [phase, detector, reviewing]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    setFaceProblem(null);
    try {
      const canvas = captureVideoFrame(video);
      const check = checkFaces(await detectFaces(canvas));
      if (check !== "ok") {
        setFaceProblem(check);
        return;
      }
      const blob = await canvasToJpeg(canvas);
      setShot({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setFaceProblem("none");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    setFaceProblem(null);
    setHint("searching");
    setPhase("starting");
  }

  function retryCamera() {
    setCameraProblem(null);
    setPhase("starting");
    setSession((value) => value + 1);
  }

  const canShoot = phase === "live" && detector === "ready" && !busy;

  return (
    <div>
      <div className="corners mx-auto w-full max-w-md">
        <div className="relative aspect-square overflow-hidden rounded-md bg-slate">
          {/* La vista previa va en espejo, como un espejo de verdad; la foto, no. */}
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            disablePictureInPicture
            aria-label="Vista previa de tu cámara"
            className={cx("size-full -scale-x-100 object-cover", (reviewing || phase === "error") && "invisible")}
            data-testid="camara-video"
          />

          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen local en memoria (blob:)
            <img
              src={shot.url}
              alt="La foto que acabas de hacer"
              className="absolute inset-0 size-full object-cover"
              data-testid="foto-capturada"
            />
          ) : null}

          {!reviewing && phase === "live" ? <OvalGuide hint={hint} /> : null}

          {!reviewing && phase === "starting" ? (
            <p className="label absolute inset-0 flex animate-blink items-center justify-center text-ash">
              Encendiendo la cámara…
            </p>
          ) : null}

          {!reviewing && phase === "error" ? (
            <p className="label absolute inset-0 flex items-center justify-center px-6 text-center text-ash">
              Cámara no disponible
            </p>
          ) : null}
        </div>
      </div>

      <div className="mx-auto mt-5 max-w-md" aria-live="polite">
        {reviewing ? (
          <p className="text-center text-lg font-semibold">¿Se te ve bien? Esta es la foto que vamos a animar.</p>
        ) : phase === "error" && cameraProblem ? (
          <PermissionHelp problem={cameraProblem} />
        ) : faceProblem ? (
          <Notice tone="error" title={FACE_MESSAGES[faceProblem].title} testId={`cara-${faceProblem}`}>
            {FACE_MESSAGES[faceProblem].body}
          </Notice>
        ) : (
          <p
            className={cx("text-center text-lg font-semibold", hint === "good" && "text-ok")}
            data-testid="camara-pista"
            data-hint={hint}
          >
            {phase === "live" ? HINTS[hint] : HINTS.searching}
          </p>
        )}
      </div>

      <div className="mx-auto mt-5 flex max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
        {reviewing ? (
          <>
            <Button variant="secondary" onClick={retake} data-testid="repetir">
              Repetir
            </Button>
            <Button onClick={() => shot && onPhoto(shot.blob)} data-testid="usar-foto">
              Usar esta foto
            </Button>
          </>
        ) : phase === "error" ? (
          <>
            <Button onClick={retryCamera} data-testid="camara-reintentar">
              Reintentar
            </Button>
            {onSwitchToUpload ? (
              <Button variant="secondary" onClick={onSwitchToUpload}>
                Subir una foto
              </Button>
            ) : null}
          </>
        ) : (
          <Button onClick={capture} disabled={!canShoot} className="sm:min-w-56" data-testid="hacer-foto">
            {detector === "loading" ? "Preparando…" : busy ? "Comprobando…" : "Hacer foto"}
          </Button>
        )}
      </div>
    </div>
  );
}
