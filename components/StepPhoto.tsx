"use client";

import { type KeyboardEvent, type Ref, useRef, useState } from "react";
import { CameraPanel } from "./photo/CameraPanel";
import { UploadPanel } from "./photo/UploadPanel";
import { useFaceDetector } from "./photo/useFaceDetector";
import { Button, cx, Notice, StepShell } from "./ui";

type Tab = "camera" | "upload";

interface StepPhotoProps {
  /** `false` = solo cámara: la pestaña "Subir foto" ni siquiera se muestra. */
  uploadEnabled: boolean;
  onPhoto: (photo: Blob) => void;
  onBack: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

const TAB_LABELS: Record<Tab, string> = { camera: "Cámara", upload: "Subir foto" };

export function StepPhoto({ uploadEnabled, onPhoto, onBack, headingRef }: StepPhotoProps) {
  const [tab, setTab] = useState<Tab>("camera");
  const detector = useFaceDetector();
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const tabs: Tab[] = uploadEnabled ? ["camera", "upload"] : ["camera"];

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "camera" ? "upload" : "camera";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <StepShell
      step={3}
      title="Ahora, tu cara"
      lead={
        uploadEnabled
          ? "Hazte una foto o sube una tuya. No sale de tu dispositivo hasta que pulses «Generar vídeo»."
          : "Hazte una foto. No sale de tu dispositivo hasta que pulses «Generar vídeo»."
      }
      headingRef={headingRef}
    >
      {uploadEnabled ? (
        <div role="tablist" aria-label="Origen de la foto" className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-coal p-1">
          {tabs.map((id) => (
            <button
              key={id}
              ref={(node) => {
                tabRefs.current[id] = node;
              }}
              type="button"
              role="tab"
              id={`pestana-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={onTabKey}
              className={cx(
                "min-h-12 rounded-md px-4 font-bold transition-colors",
                tab === id ? "bg-paper text-ink" : "text-ash hover:text-paper",
              )}
              data-testid={`pestana-${id}`}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </div>
      ) : null}

      {detector.status === "error" ? (
        <Notice tone="error" role="alert" title="No hemos podido cargar el detector de caras" className="mb-5" testId="detector-error">
          <p>
            Lo necesitamos para comprobar que en la foto hay una sola persona. Revisa tu conexión y vuelve a
            intentarlo.
          </p>
          <Button variant="secondary" className="mt-3" onClick={detector.retry}>
            Reintentar
          </Button>
        </Notice>
      ) : null}

      <div
        role={uploadEnabled ? "tabpanel" : undefined}
        id={`panel-${tab}`}
        aria-labelledby={uploadEnabled ? `pestana-${tab}` : undefined}
      >
        {tab === "camera" ? (
          <CameraPanel
            detector={detector.status}
            onPhoto={onPhoto}
            onSwitchToUpload={uploadEnabled ? () => setTab("upload") : undefined}
          />
        ) : (
          <UploadPanel detector={detector.status} onPhoto={onPhoto} />
        )}
      </div>

      <div className="mt-8 border-t border-line pt-4">
        <Button variant="quiet" onClick={onBack}>
          Volver
        </Button>
      </div>
    </StepShell>
  );
}
