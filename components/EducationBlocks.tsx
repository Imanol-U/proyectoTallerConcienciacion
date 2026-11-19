import type { ReactNode } from "react";
import { type EducationBlock, formatCost, HOW_TO_SPOT, IF_IT_HAPPENS } from "@/lib/texts";

function Block({ block, children }: { block: EducationBlock; children?: ReactNode }) {
  return (
    <section
      aria-labelledby={`bloque-${block.id}`}
      className="rounded-xl border border-line bg-coal p-5 sm:p-6"
      data-testid={`bloque-${block.id}`}
    >
      <h2 id={`bloque-${block.id}`} className="display text-[1.75rem]">
        {block.title}
      </h2>
      {children}
      <ul className="mt-4 space-y-3">
        {block.points.map((point) => (
          <li key={point.lead} className="border-l-2 border-line pl-4">
            <p>
              <strong>{point.lead}</strong> <span className="text-ash">{point.text}</span>
            </p>
            {point.links ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {point.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline decoration-signal decoration-2 hover:text-signal"
                    >
                      {link.label}
                      <span aria-hidden="true"> ↗</span>
                      <span className="sr-only"> (se abre en otra pestaña)</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Los dos bloques que no dependen del vídeo: cómo detectarlo y qué hacer. */
export function EducationBlocks() {
  return (
    <>
      <Block block={HOW_TO_SPOT} />
      <Block block={IF_IT_HAPPENS} />
    </>
  );
}

interface WhatHappenedProps {
  /** Segundos que ha tardado en generarse el vídeo. */
  seconds: number;
  /** Coste medido por vídeo, en euros, o `null` si aún no se ha medido. */
  costPerVideoEur: number | null;
}

/** Bloque 1: lo que acaba de pasar (1 foto, X segundos, coste aproximado). */
export function WhatHappened({ seconds, costPerVideoEur }: WhatHappenedProps) {
  const rounded = Math.max(1, Math.round(seconds));
  const stats = [
    ["1", "foto"],
    [String(rounded), rounded === 1 ? "segundo" : "segundos"],
    [formatCost(costPerVideoEur), "coste aprox."],
  ] as const;

  return (
    <section
      aria-labelledby="bloque-paso"
      className="rounded-xl border border-signal/60 bg-signal-deep p-5 sm:p-6"
      data-testid="bloque-paso"
    >
      <h2 id="bloque-paso" className="display text-[1.75rem]">
        Lo que acaba de pasar
      </h2>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {stats.map(([value, unit]) => (
          <div key={unit} className="border-t-2 border-signal pt-2">
            <dt className="sr-only">{unit}</dt>
            <dd>
              <span className="display block text-[1.9rem] leading-none sm:text-4xl">{value}</span>
              <span className="label mt-1 block text-paper/80">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-paper/90">
        Eso es todo lo que ha hecho falta. Ni tu voz, ni más fotos, ni conocimientos técnicos: quien tenga
        una foto tuya —la de tu perfil, por ejemplo— puede hacer lo mismo, y sin marca de agua.
      </p>
    </section>
  );
}
