"use client";

import Link from "next/link";
import { type ReactNode, type Ref, useRef, useState } from "react";
import { Button, cx, Notice, StepShell } from "./ui";

export type ConsentState = readonly [boolean, boolean, boolean];

interface StepConsentProps {
  value: ConsentState;
  onChange: (value: ConsentState) => void;
  onAccept: () => void;
  onBack: () => void;
  retentionMinutes: number;
  headingRef?: Ref<HTMLHeadingElement>;
}

const PRIVACY_LINK = (
  <Link href="/privacidad" className="font-normal text-ash underline hover:text-paper">
    Aviso de privacidad
  </Link>
);

const ITEMS: ReadonlyArray<{ id: string; label: string; extra?: ReactNode }> = [
  { id: "consent-edad", label: "Soy mayor de 18 años." },
  {
    id: "consent-yo",
    label: "La persona de la foto soy yo, y es adulta. No usaré fotos de otras personas.",
  },
  {
    id: "consent-envio",
    label:
      "Acepto que mi foto se envíe a un servicio externo de IA para generar el vídeo y se borre después.",
    extra: PRIVACY_LINK,
  },
];

export function StepConsent({ value, onChange, onAccept, onBack, retentionMinutes, headingRef }: StepConsentProps) {
  const [showError, setShowError] = useState(false);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const complete = value.every(Boolean);

  function toggle(index: number, checked: boolean) {
    const next = [...value] as [boolean, boolean, boolean];
    next[index] = checked;
    onChange(next);
    if (next.every(Boolean)) setShowError(false);
  }

  function submit() {
    if (complete) {
      onAccept();
      return;
    }
    setShowError(true);
    boxes.current[value.findIndex((checked) => !checked)]?.focus();
  }

  return (
    <StepShell
      step={2}
      title="Antes de empezar, tu permiso"
      lead="Vamos a usar tu cara. Solo seguimos si marcas las tres casillas."
      headingRef={headingRef}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <fieldset>
          <legend className="sr-only">Consentimiento (las tres casillas son obligatorias)</legend>
          <ul className="space-y-3">
            {ITEMS.map((item, index) => (
              <li key={item.id}>
                <label
                  htmlFor={item.id}
                  className={cx(
                    "flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors",
                    value[index] ? "border-paper/70 bg-slate" : "border-line bg-coal hover:border-ash",
                    showError && !value[index] && "border-signal",
                  )}
                >
                  <input
                    id={item.id}
                    ref={(node) => {
                      boxes.current[index] = node;
                    }}
                    type="checkbox"
                    required
                    checked={value[index]}
                    onChange={(event) => toggle(index, event.target.checked)}
                    aria-invalid={showError && !value[index]}
                    className="mt-0.5 size-6 shrink-0 cursor-pointer accent-signal"
                  />
                  <span className="font-semibold leading-snug">
                    {item.label}
                    {item.extra ? <span className="mt-1 block text-sm">{item.extra}</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div aria-live="polite" className="mt-4">
          {showError && !complete ? (
            <Notice tone="error" testId="error-consentimiento">
              Marca las tres casillas para continuar. Si alguna no se cumple, esta demo no es para ti.
            </Notice>
          ) : null}
        </div>

        <details className="mt-5 rounded-lg border border-line bg-coal">
          <summary className="cursor-pointer px-4 py-3 font-semibold">Qué pasa exactamente con tu foto</summary>
          <ul className="list-disc space-y-2 px-4 pb-4 pl-9 text-ash">
            <li>
              Sale de tu dispositivo solo cuando pulses «Generar vídeo». Va a nuestro servidor y de ahí a
              OpenRouter y xAI, el servicio de IA que genera el vídeo.
            </li>
            <li>
              No la guardamos. El vídeo resultante se borra solo a los {retentionMinutes} minutos, o al
              momento si pulsas «Borrar mis datos ahora».
            </li>
            <li>No usamos cookies ni analítica, y no pedimos tu nombre ni tu correo.</li>
          </ul>
        </details>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <Button variant="quiet" onClick={onBack}>
            Volver
          </Button>
          <Button type="submit" className={cx("sm:ml-auto", !complete && "opacity-60")} data-testid="aceptar">
            Continuar
          </Button>
        </div>
      </form>
    </StepShell>
  );
}
