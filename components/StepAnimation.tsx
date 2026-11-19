"use client";

import { type Ref, useEffect, useRef, useState } from "react";
import { ANIMATION_IDS, ANIMATIONS, type AnimationId } from "@/lib/animations";
import { Button, cx, Notice, StepShell } from "./ui";

interface StepAnimationProps {
  photoUrl: string;
  selected: AnimationId | null;
  onSelect: (id: AnimationId) => void;
  onGenerate: () => void;
  onChangePhoto: () => void;
  /** Ya hay un vídeo generándose: se ofrece volver a la espera. */
  busy: boolean;
  /** Intentos que quedan hoy, si ya se conoce el dato. */
  remaining: number | null;
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Miniatura en bucle. Con "reducir movimiento" solo se mueve la elegida. */
function LoopingPreview({ src, active }: { src: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm && !active) {
      video.pause();
      return;
    }
    // Algunos navegadores rechazan la reproducción automática: no pasa nada,
    // se queda el primer fotograma.
    video.play().catch(() => {});
  }, [active]);

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
      className="aspect-square w-full bg-slate object-cover"
    />
  );
}

export function StepAnimation({
  photoUrl,
  selected,
  onSelect,
  onGenerate,
  onChangePhoto,
  busy,
  remaining,
  headingRef,
}: StepAnimationProps) {
  const [showError, setShowError] = useState(false);

  function submit() {
    if (!selected && !busy) {
      setShowError(true);
      return;
    }
    onGenerate();
  }

  return (
    <StepShell
      step={4}
      title="Elige qué va a hacer tu cara"
      lead="Seis animaciones fijas, elegidas por nosotros. La IA hará que tu cara haga la que elijas."
      headingRef={headingRef}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="mb-6 flex items-center gap-4 rounded-lg border border-line bg-coal p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen local en memoria (blob:) */}
          <img
            src={photoUrl}
            alt="Tu foto"
            width={64}
            height={64}
            className="size-16 rounded-md object-cover"
            data-testid="foto-elegida"
          />
          <div className="min-w-0 flex-1">
            <p className="label text-ash">Entrada</p>
            <p className="font-semibold">1 foto tuya. Nada más.</p>
          </div>
          <Button variant="quiet" onClick={onChangePhoto} disabled={busy}>
            Cambiar
          </Button>
        </div>

        <fieldset disabled={busy}>
          <legend className="sr-only">Animación</legend>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {ANIMATION_IDS.map((id) => {
              const animation = ANIMATIONS[id];
              const isSelected = selected === id;
              return (
                <label
                  key={id}
                  data-testid={`animacion-${id}`}
                  className={cx(
                    "group relative cursor-pointer overflow-hidden rounded-xl border-2 bg-coal transition-colors",
                    "has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-paper",
                    isSelected ? "border-signal" : "border-line hover:border-ash",
                    busy && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="animation"
                    value={id}
                    checked={isSelected}
                    onChange={() => {
                      onSelect(id);
                      setShowError(false);
                    }}
                    className="sr-only"
                  />
                  <LoopingPreview src={animation.preview} active={isSelected} />
                  <span
                    aria-hidden="true"
                    className={cx(
                      "absolute right-2 top-2 flex size-7 items-center justify-center rounded-full font-mono text-sm font-bold",
                      isSelected ? "bg-signal text-ink" : "border-2 border-paper/60 bg-ink/50 text-transparent",
                    )}
                  >
                    ✓
                  </span>
                  <span className="block p-3">
                    <span className="display block text-2xl">{animation.label}</span>
                    <span className="block text-sm leading-snug text-ash">
                      {animation.description} · {animation.seconds} s
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div aria-live="polite" className="mt-4">
          {showError && !selected ? (
            <Notice tone="error" testId="error-animacion">
              Elige una de las seis animaciones.
            </Notice>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-ash sm:mr-auto">
            {remaining !== null
              ? remaining === 0
                ? "Ya has usado todos tus vídeos de hoy. Mañana podrás hacer más."
                : `Te ${remaining === 1 ? "queda 1 vídeo" : `quedan ${remaining} vídeos`} más hoy.`
              : "Tu foto sale de este dispositivo al pulsar el botón."}
          </p>
          <Button type="submit" className={cx(!selected && !busy && "opacity-60")} data-testid="generar">
            {busy ? "Volver a la espera" : "Generar vídeo"}
          </Button>
        </div>
      </form>
    </StepShell>
  );
}
