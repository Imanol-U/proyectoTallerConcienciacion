"use client";

import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef } from "react";
import { clamp, clampCrop, type Crop, drawCrop, PHOTO_SIZE } from "@/lib/photo";

/** Zoom máximo respecto al encuadre completo. */
export const MAX_ZOOM = 4;

interface CropperProps {
  /** Copia de trabajo de la foto subida. */
  source: HTMLCanvasElement;
  crop: Crop;
  onChange: (crop: Crop) => void;
  /** Lienzo de 512×512 con el recorte: es exactamente lo que se exportará. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

interface Gesture {
  crop: Crop;
  /** Punto medio de los dedos (o el puntero) al empezar, en píxeles de pantalla. */
  x: number;
  y: number;
  /** Distancia entre los dos dedos al empezar (0 si solo hay uno). */
  spread: number;
}

/**
 * Recorte manual sencillo: arrastrar para mover y pellizcar (o usar el
 * deslizador) para acercar. Lo que se ve es lo que se envía.
 */
export function Cropper({ source, crop, onChange, canvasRef }: CropperProps) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  const largest = Math.min(source.width, source.height);
  const zoom = largest / crop.size;

  useEffect(() => {
    if (canvasRef.current) drawCrop(canvasRef.current, source, crop);
  }, [canvasRef, source, crop]);

  function commit(next: Crop) {
    onChange(clampCrop(next, source.width, source.height, MAX_ZOOM));
  }

  /** Cambia el zoom manteniendo fijo el centro del encuadre. */
  function zoomTo(nextZoom: number, base: Crop = crop) {
    const size = largest / clamp(nextZoom, 1, MAX_ZOOM);
    const centerX = base.x + base.size / 2;
    const centerY = base.y + base.size / 2;
    commit({ size, x: centerX - size / 2, y: centerY - size / 2 });
  }

  function restartGesture() {
    const points = [...pointers.current.values()];
    if (points.length === 0) {
      gesture.current = null;
      return;
    }
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const spread = points.length >= 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    gesture.current = { crop, x, y, spread };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    restartGesture();
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const start = gesture.current;
    const points = [...pointers.current.values()];
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const side = event.currentTarget.getBoundingClientRect().width || 1;

    let size = start.crop.size;
    if (points.length >= 2 && start.spread > 0) {
      const spread = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      size = clamp(start.crop.size * (start.spread / Math.max(1, spread)), largest / MAX_ZOOM, largest);
    }
    // Píxeles de pantalla → píxeles de la foto.
    const scale = start.crop.size / side;
    const centerX = start.crop.x + start.crop.size / 2 - (x - start.x) * scale;
    const centerY = start.crop.y + start.crop.size / 2 - (y - start.y) * scale;
    commit({ size, x: centerX - size / 2, y: centerY - size / 2 });
  }

  function onPointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    restartGesture();
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const step = crop.size * 0.04;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (event.key in moves) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      commit({ ...crop, x: crop.x + dx, y: crop.y + dy });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo(zoom * 1.1);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomTo(zoom / 1.1);
    }
  }

  return (
    <div>
      <div className="corners mx-auto w-full max-w-md">
        <div className="relative aspect-square overflow-hidden rounded-md bg-slate">
          <canvas
            ref={canvasRef}
            width={PHOTO_SIZE}
            height={PHOTO_SIZE}
            tabIndex={0}
            role="img"
            aria-label="Recorte de tu foto. Arrastra para moverla; usa las flechas del teclado para moverla y las teclas más y menos para acercar o alejar."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onKeyDown}
            className="size-full cursor-grab touch-none select-none active:cursor-grabbing"
            data-testid="recorte"
          />
          {/* Guía: dónde debería quedar la cara. */}
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
            <ellipse
              cx="50"
              cy="47"
              rx="27"
              ry="36"
              fill="none"
              stroke="var(--color-paper)"
              strokeOpacity="0.75"
              strokeWidth="2"
              strokeDasharray="10 8"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>

      <label className="mx-auto mt-5 flex max-w-md items-center gap-3">
        <span className="label text-ash">Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(event) => zoomTo(Number(event.target.value))}
          className="h-11 flex-1 cursor-pointer accent-signal"
          data-testid="zoom"
        />
        <span className="w-12 text-right font-mono text-sm text-ash">{zoom.toFixed(1)}×</span>
      </label>
    </div>
  );
}
