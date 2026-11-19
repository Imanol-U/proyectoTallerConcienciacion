"use client";

import { type Ref, useEffect, useRef, useState } from "react";
import { ANIMATIONS, type AnimationId } from "@/lib/animations";
import { type FailureCode, videoUrl } from "@/lib/generateClient";
import { WAITING_FACTS } from "@/lib/texts";
import { EducationBlocks, WhatHappened } from "./EducationBlocks";
import { Button, cx, Notice, StepShell } from "./ui";

export type Generation =
  | { status: "running"; animation: AnimationId; startedAt: number }
  | {
      status: "done";
      animation: AnimationId;
      id: string;
      /** Segundos que tardó en generarse. */
      seconds: number;
      /** Momento (ms) en que el servidor borra el vídeo. */
      expiresAt: number;
    }
  | { status: "expired"; animation: AnimationId }
  | { status: "error"; animation: AnimationId; code: FailureCode; message: string };

interface StepResultProps {
  generation: Generation;
  photoUrl: string;
  costPerVideoEur: number | null;
  retentionMinutes: number;
  deleting: boolean;
  onRetry: () => void;
  onAnother: () => void;
  onChangePhoto: () => void;
  onDeleteAll: () => void;
  /** El vídeo ha dejado de estar disponible (caducó o se borró). */
  onVideoGone: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}

function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function PhotoFrame({ photoUrl, scanning }: { photoUrl: string; scanning?: boolean }) {
  return (
    <div className="corners mx-auto w-full max-w-sm">
      <div className="relative aspect-square overflow-hidden rounded-md bg-slate">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen local en memoria (blob:) */}
        <img src={photoUrl} alt="Tu foto" className={cx("size-full object-cover", scanning && "opacity-70 grayscale")} />
        {scanning ? (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1/5 animate-scan bg-linear-to-b from-transparent to-signal/45"
            />
            <p className="label absolute left-3 top-3 animate-blink rounded bg-ink/80 px-2 py-1 text-signal">
              Procesando
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Waiting({ generation, photoUrl }: { generation: Extract<Generation, { status: "running" }>; photoUrl: string }) {
  const now = useNow(500, true);
  const elapsed = (now - generation.startedAt) / 1000;
  const fact = WAITING_FACTS[Math.floor(Math.max(0, elapsed) / 5) % WAITING_FACTS.length];

  return (
    <div data-testid="espera">
      <PhotoFrame photoUrl={photoUrl} scanning />
      <p className="label mt-6 text-center text-ash">
        {ANIMATIONS[generation.animation].label} · <span className="text-paper">{clock(elapsed)}</span>
      </p>
      <div className="mx-auto mt-5 max-w-md rounded-lg border border-line bg-coal p-5 text-center">
        <p className="label text-signal">Mientras esperas</p>
        <p aria-live="polite" className="mt-2 min-h-18 text-lg font-semibold leading-snug" data-testid="dato">
          {fact}
        </p>
      </div>
      <p className="mt-5 text-center text-sm text-ash">
        Puede tardar de uno a tres minutos. No cierres esta página.
        {elapsed > 150 ? " Está tardando más de lo normal; seguimos intentándolo." : ""}
      </p>
    </div>
  );
}

type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

function FakeVideo({ id, onGone }: { id: string; onGone: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /** Pantalla completa: el recuadro entero; en iPhone, el reproductor del sistema. */
  async function toggleFullscreen() {
    const frame = frameRef.current;
    const video = ref.current as FullscreenVideo | null;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (frame?.requestFullscreen) {
      try {
        await frame.requestFullscreen();
        return;
      } catch {
        // Sigue con la alternativa.
      }
    }
    video?.webkitEnterFullscreen?.();
  }
  const [needsTap, setNeedsTap] = useState(false);
  /** El vídeo no carga, pero sigue existiendo (fallo de red): se ofrece reintentar. */
  const [broken, setBroken] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.play().catch(() => setNeedsTap(true));
  }, [id, attempt]);

  // Si el vídeo falla, se pregunta al servidor: ¿se ha borrado ya (404) o ha
  // sido un fallo de conexión? Solo en el primer caso se dice que no existe.
  async function onError() {
    try {
      const response = await fetch(videoUrl(id), { method: "HEAD", cache: "no-store" });
      if (response.status === 404) {
        onGone();
        return;
      }
    } catch {
      // Sin conexión: se ofrece reintentar.
    }
    setBroken(true);
  }

  return (
    <div className="corners mx-auto w-full max-w-md">
      <div
        ref={frameRef}
        className={cx(
          "relative overflow-hidden",
          fullscreen ? "flex size-full items-center justify-center bg-black" : "aspect-square rounded-md bg-slate",
        )}
      >
        <video
          ref={ref}
          key={`${id}-${attempt}`}
          src={videoUrl(id)}
          autoPlay
          loop
          muted
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noremoteplayback noplaybackrate"
          preload="auto"
          onPlaying={() => {
            setNeedsTap(false);
            setBroken(false);
          }}
          onError={() => void onError()}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Vídeo generado por IA a partir de tu foto."
          className={cx("size-full", fullscreen ? "object-contain" : "object-cover")}
          data-testid="video-falso"
        />
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={fullscreen ? "Salir de pantalla completa" : "Ver en pantalla completa"}
          className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-ink/70 text-paper hover:bg-ink"
          data-testid="pantalla-completa"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            {fullscreen ? (
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            ) : (
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            )}
          </svg>
        </button>
        {broken ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/80 p-6 text-center">
            <p className="font-semibold">No se ha podido cargar el vídeo. Revisa tu conexión.</p>
            <button
              type="button"
              onClick={() => {
                setBroken(false);
                setAttempt((value) => value + 1);
              }}
              className="rounded-full bg-paper px-6 py-3 font-bold text-ink"
              data-testid="recargar-video"
            >
              Reintentar
            </button>
          </div>
        ) : needsTap ? (
          <button
            type="button"
            onClick={() => ref.current?.play().catch(() => {})}
            className="absolute inset-0 flex items-center justify-center bg-ink/55 text-lg font-bold"
          >
            <span className="rounded-full bg-paper px-6 py-3 text-ink">▶ Reproducir</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Done({
  generation,
  photoUrl,
  costPerVideoEur,
  deleting,
  onAnother,
  onDeleteAll,
  onVideoGone,
}: Pick<StepResultProps, "photoUrl" | "costPerVideoEur" | "deleting" | "onAnother" | "onDeleteAll" | "onVideoGone"> & {
  generation: Extract<Generation, { status: "done" }>;
}) {
  const now = useNow(1000, true);
  const secondsLeft = (generation.expiresAt - now) / 1000;

  useEffect(() => {
    if (secondsLeft <= 0) onVideoGone();
  }, [secondsLeft, onVideoGone]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start lg:gap-10" data-testid="resultado">
      <div className="lg:sticky lg:top-6">
        <FakeVideo id={generation.id} onGone={onVideoGone} />

        <div className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-lg border border-line bg-coal p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen local en memoria (blob:) */}
          <img src={photoUrl} alt="" width={48} height={48} className="size-12 rounded object-cover" />
          <p className="text-sm leading-snug text-ash">
            <span className="label block text-ok">Real · tu foto</span>
            Lo único auténtico de esta pantalla. El movimiento no ha existido nunca.
          </p>
        </div>

        <div className="mx-auto mt-5 flex max-w-md flex-col gap-3">
          <Button onClick={onAnother} disabled={deleting} data-testid="otra-animacion">
            Probar otra animación
          </Button>
          <Button variant="danger" onClick={onDeleteAll} disabled={deleting} data-testid="borrar-datos">
            {deleting ? "Borrando…" : "Borrar mis datos ahora"}
          </Button>
          <p className="text-center text-sm text-ash" data-testid="cuenta-atras">
            Si no haces nada, el vídeo se borra solo en <span className="font-mono text-paper">{clock(secondsLeft)}</span>.
            <br />
            No se puede descargar.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <WhatHappened seconds={generation.seconds} costPerVideoEur={costPerVideoEur} />
        <EducationBlocks />
      </div>
    </div>
  );
}

const PHOTO_PROBLEMS: ReadonlySet<FailureCode> = new Set(["no_face", "rejected", "photo"]);

function Failed({
  generation,
  onRetry,
  onAnother,
  onChangePhoto,
  onDeleteAll,
}: Pick<StepResultProps, "onRetry" | "onAnother" | "onChangePhoto" | "onDeleteAll"> & {
  generation: Extract<Generation, { status: "error" }>;
}) {
  const isLimit = generation.code === "limit";
  const isPhoto = PHOTO_PROBLEMS.has(generation.code);

  return (
    <div data-testid="fallo">
      <Notice
        tone={isLimit ? "warn" : "error"}
        role="alert"
        title={
          isLimit
            ? "Límite diario alcanzado"
            : isPhoto
              ? "Esa foto no nos sirve"
              : "No hemos podido generar el vídeo"
        }
        testId={`error-${generation.code}`}
      >
        {generation.message}
      </Notice>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {isLimit ? (
          <Button variant="secondary" onClick={onDeleteAll}>
            Volver al inicio
          </Button>
        ) : isPhoto ? (
          <>
            <Button onClick={onChangePhoto} data-testid="cambiar-foto">
              Cambiar la foto
            </Button>
            <Button variant="secondary" onClick={onAnother}>
              Elegir otra animación
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onRetry} data-testid="reintentar">
              Reintentar
            </Button>
            <Button variant="secondary" onClick={onAnother}>
              Elegir otra animación
            </Button>
          </>
        )}
      </div>

      {isLimit ? (
        <div className="mt-8 space-y-5">
          <p className="text-ash">Mientras tanto, lo importante de la demo sigue aquí:</p>
          <EducationBlocks />
        </div>
      ) : null}
    </div>
  );
}

function Expired({
  retentionMinutes,
  onAnother,
  onDeleteAll,
}: Pick<StepResultProps, "retentionMinutes" | "onAnother" | "onDeleteAll">) {
  return (
    <div data-testid="caducado">
      <Notice tone="ok" role="status" title="El vídeo ya no existe">
        Lo hemos borrado del servidor, tal como prometimos: ningún vídeo vive más de {retentionMinutes}{" "}
        minutos.
      </Notice>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button onClick={onAnother}>Generar otro vídeo</Button>
        <Button variant="secondary" onClick={onDeleteAll}>
          Terminar y borrar mi foto
        </Button>
      </div>
      <div className="mt-8 space-y-5">
        <EducationBlocks />
      </div>
    </div>
  );
}

const TITLES: Record<Generation["status"], string> = {
  running: "Fabricando tu vídeo falso…",
  done: "Tú nunca has hecho esto.",
  expired: "Vídeo borrado.",
  error: "Algo no ha salido bien.",
};

export function StepResult(props: StepResultProps) {
  const { generation, headingRef } = props;

  return (
    <StepShell
      step={5}
      title={TITLES[generation.status]}
      lead={
        generation.status === "done"
          ? "Lo acaba de inventar una IA a partir de tu foto. La marca de agua está para que nadie pueda hacerlo pasar por real."
          : undefined
      }
      headingRef={headingRef}
      wide={generation.status === "done"}
    >
      {generation.status === "running" ? <Waiting generation={generation} photoUrl={props.photoUrl} /> : null}
      {generation.status === "done" ? <Done {...props} generation={generation} /> : null}
      {generation.status === "error" ? <Failed {...props} generation={generation} /> : null}
      {generation.status === "expired" ? <Expired {...props} /> : null}
    </StepShell>
  );
}
