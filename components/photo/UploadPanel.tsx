"use client";

import { useEffect, useRef, useState } from "react";
import { checkFaces, detectFaces, FACE_MESSAGES, type FaceCheck, loadFaceDetector } from "@/lib/faceDetection";
import {
  ACCEPT_ATTRIBUTE,
  canvasToJpeg,
  centerCrop,
  type Crop,
  cropAroundFace,
  downscale,
  loadWorkingCopy,
  UPLOAD_MESSAGES,
  type UploadProblem,
  validateUpload,
} from "@/lib/photo";
import { Button, Notice } from "../ui";
import { Cropper, MAX_ZOOM } from "./Cropper";
import type { DetectorStatus } from "./useFaceDetector";

interface UploadPanelProps {
  detector: DetectorStatus;
  onPhoto: (photo: Blob) => void;
}

type CropStatus = FaceCheck | "checking";

export function UploadPanel({ detector, onPhoto }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploadProblem, setUploadProblem] = useState<UploadProblem | null>(null);
  /** La foto original tiene varias caras: se rechaza entera. */
  const [rejected, setRejected] = useState(false);
  const [work, setWork] = useState<HTMLCanvasElement | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [cropStatus, setCropStatus] = useState<CropStatus>("checking");
  const [busy, setBusy] = useState(false);

  // Cada vez que cambia el recorte se vuelve a comprobar (con una pequeña
  // espera, para no analizar cada milímetro del arrastre).
  useEffect(() => {
    if (!work || !crop) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const canvas = viewRef.current;
      if (!canvas) return;
      try {
        const check = checkFaces(await detectFaces(canvas));
        if (!cancelled) setCropStatus(check);
      } catch {
        // Lo cuenta el aviso general del detector.
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [work, crop]);

  async function onFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    setUploadProblem(null);
    setRejected(false);
    const problem = validateUpload(file);
    if (problem) {
      setUploadProblem(problem);
      return;
    }

    setLoading(true);
    try {
      let canvas: HTMLCanvasElement;
      try {
        canvas = await loadWorkingCopy(file);
      } catch {
        setUploadProblem("decode");
        return;
      }
      await loadFaceDetector();
      const faces = await detectFaces(downscale(canvas, 640));
      if (faces.length > 1) {
        setRejected(true);
        return;
      }
      setCropStatus("checking");
      setCrop(
        faces.length === 1
          ? cropAroundFace(faces[0], canvas.width, canvas.height, MAX_ZOOM)
          : centerCrop(canvas.width, canvas.height),
      );
      setWork(canvas);
    } catch {
      // El detector no ha cargado: el aviso (con «Reintentar») está más arriba.
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setWork(null);
    setCrop(null);
    setCropStatus("checking");
    setUploadProblem(null);
    setRejected(false);
  }

  async function accept() {
    const canvas = viewRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    try {
      // Comprobación final sobre la imagen exacta que se va a enviar.
      const check = checkFaces(await detectFaces(canvas));
      setCropStatus(check);
      if (check === "ok") onPhoto(await canvasToJpeg(canvas));
    } catch {
      setCropStatus("none");
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT_ATTRIBUTE}
      onChange={(event) => void onFile(event.target.files?.[0])}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="archivo"
    />
  );

  if (work && crop) {
    return (
      <div>
        {picker}
        <Cropper
          source={work}
          crop={crop}
          canvasRef={viewRef}
          onChange={(next) => {
            setCrop(next);
            setCropStatus("checking");
          }}
        />

        <div className="mx-auto mt-4 max-w-md" aria-live="polite">
          {cropStatus === "ok" ? (
            <p className="text-center text-lg font-semibold text-ok" data-testid="recorte-ok">
              ✓ Una cara, bien encuadrada.
            </p>
          ) : cropStatus === "checking" ? (
            <p className="text-center text-lg text-ash">Arrastra y acerca hasta centrar tu cara…</p>
          ) : (
            <Notice tone="error" title={FACE_MESSAGES[cropStatus].title} testId={`cara-${cropStatus}`}>
              {cropStatus === "none"
                ? "No vemos una cara en este encuadre. Muévelo o acércalo hasta que tu cara quede dentro del óvalo."
                : FACE_MESSAGES.many.body}
            </Notice>
          )}
        </div>

        <div className="mx-auto mt-5 flex max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="secondary" onClick={reset} data-testid="repetir">
            Repetir
          </Button>
          <Button onClick={accept} disabled={cropStatus !== "ok" || busy} data-testid="usar-foto">
            Usar esta foto
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      {picker}
      <div className="rounded-xl border-2 border-dashed border-line bg-coal p-6 text-center sm:p-8">
        <p className="display text-3xl">Sube solo una foto tuya.</p>
        <p className="mt-2 text-ash">
          JPEG, PNG o WebP, hasta 10 MB. Que se te vea la cara de frente, con buena luz y sin nadie más.
        </p>
        <Button
          className="mt-6 w-full sm:w-auto"
          onClick={() => inputRef.current?.click()}
          disabled={loading || detector === "error"}
          data-testid="elegir-archivo"
        >
          {loading ? "Abriendo la foto…" : "Elegir archivo"}
        </Button>
      </div>

      <div className="mt-4 space-y-3" aria-live="polite">
        {uploadProblem ? (
          <Notice tone="error" title={UPLOAD_MESSAGES[uploadProblem].title} testId={`subida-${uploadProblem}`}>
            {UPLOAD_MESSAGES[uploadProblem].body}
          </Notice>
        ) : null}
        {rejected ? (
          <Notice tone="error" title={FACE_MESSAGES.many.title} testId="cara-many">
            {FACE_MESSAGES.many.body}
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
