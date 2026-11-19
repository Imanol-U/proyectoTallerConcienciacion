import type { Ref } from "react";
import { Button, Notice } from "./ui";

interface StepIntroProps {
  onStart: () => void;
  uploadEnabled: boolean;
  retentionMinutes: number;
  /** Mensaje tras "Borrar mis datos ahora". */
  notice?: string | null;
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Ilustración de la portada: el óvalo de la cara y su copia descuadrada. */
function FaceCopyArt() {
  return (
    <svg
      viewBox="0 0 420 470"
      role="img"
      aria-label="Un óvalo que representa una cara y, desplazada, su copia falsa"
      className="h-auto w-full max-w-[26rem]"
    >
      <defs>
        <clipPath id="marco">
          <rect x="34" y="30" width="352" height="410" rx="6" />
        </clipPath>
        <linearGradient id="barrido" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff4b2b" stopOpacity="0" />
          <stop offset="1" stopColor="#ff4b2b" stopOpacity="0.28" />
        </linearGradient>
      </defs>

      {/* Marco con marcas de registro */}
      <rect x="34" y="30" width="352" height="410" rx="6" fill="#131318" stroke="#2e2e39" />
      <g stroke="#f4f1ea" strokeWidth="2.5" fill="none" strokeLinecap="square">
        <path d="M20 46V16h30M370 16h30v30M400 424v30h-30M50 454H20v-30" />
      </g>

      <g clipPath="url(#marco)">
        {/* Copia falsa: desplazada y a trazos */}
        <g stroke="#ff4b2b" strokeWidth="3" fill="none" transform="translate(26 18)">
          <ellipse cx="204" cy="212" rx="96" ry="128" strokeDasharray="10 9" />
          <path d="M168 196h26M224 196h26" strokeLinecap="round" />
          <path d="M176 262q33 26 66 0" strokeLinecap="round" />
          <path d="M92 440c10-66 56-98 112-98s102 32 112 98" strokeDasharray="10 9" />
        </g>

        {/* Original */}
        <g stroke="#f4f1ea" strokeWidth="3" fill="none">
          <ellipse cx="204" cy="212" rx="96" ry="128" />
          <path d="M168 196h26M224 196h26" strokeLinecap="round" />
          <path d="M184 266h46" strokeLinecap="round" />
          <path d="M92 440c10-66 56-98 112-98s102 32 112 98" />
        </g>

        {/* Línea de escaneo */}
        <rect x="34" y="30" width="352" height="46" fill="url(#barrido)" className="animate-scan" style={{ transformBox: "view-box" }} />
      </g>

      <g fontFamily="var(--font-jetbrains), monospace" fontSize="12" letterSpacing="2.2">
        <text x="48" y="54" fill="#f4f1ea">
          ORIGINAL
        </text>
        <text x="372" y="54" fill="#ff4b2b" textAnchor="end">
          COPIA · IA
        </text>
      </g>
    </svg>
  );
}

export function StepIntro({ onStart, uploadEnabled, retentionMinutes, notice, headingRef }: StepIntroProps) {
  const steps = [
    {
      title: "Una foto",
      text: uploadEnabled
        ? "Hazte una con la cámara o sube una foto tuya."
        : "Hazte una foto con la cámara de tu dispositivo.",
    },
    {
      title: "Un gesto",
      text: "Elige una de las seis animaciones que hemos preparado.",
    },
    {
      title: "Tu cara, moviéndose",
      text: "En uno o dos minutos verás un vídeo de 4 a 10 segundos protagonizado por tu cara.",
    },
  ];

  const limits = [
    ["Siempre marcado", "El vídeo lleva quemada la franja «Generado por IA». No hay versión sin marca."],
    ["Sin palabras en tu boca", "Ni texto, ni audio, ni voz: solo gestos inofensivos elegidos por nosotros."],
    ["Sin descarga", "El vídeo se ve aquí y nada más."],
    ["Sin rastro", `Tu foto no se guarda y el vídeo se borra solo a los ${retentionMinutes} minutos.`],
  ] as const;

  return (
    <div className="animate-rise">
      <section className="relative isolate overflow-hidden" aria-labelledby="portada-titulo">
        <div className="grid-fade absolute inset-0 -z-10" aria-hidden="true" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-12 pt-10 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:gap-6 lg:pb-20 lg:pt-16">
          <div>
            {notice ? (
              <Notice tone="ok" role="status" className="mb-7 max-w-xl" testId="aviso-borrado">
                {notice}
              </Notice>
            ) : null}
            <p className="label text-ash">Deepfakes · compruébalo contigo</p>
            <h1
              id="portada-titulo"
              ref={headingRef}
              tabIndex={-1}
              className="display mt-4 text-[clamp(2.9rem,12vw,6.4rem)]"
            >
              Con una foto tuya basta para{" "}
              <span className="fake">
                falsificarte
                <span aria-hidden="true" className="fake-ghost">
                  falsificarte
                </span>
              </span>{" "}
              en vídeo.
            </h1>
            <p className="mt-6 max-w-lg text-xl text-paper/85 sm:text-2xl">
              Compruébalo en 60 segundos, con tu propia cara.
            </p>
            <Button
              onClick={onStart}
              className="mt-8 w-full whitespace-nowrap text-xl sm:w-auto sm:px-10"
              data-testid="empezar"
            >
              Probar con mi cara
              <span aria-hidden="true">→</span>
            </Button>
            <p className="label mt-4 text-ash">Mayores de 18 · sin registro · sin cookies</p>
          </div>
          <div className="mx-auto w-4/5 max-w-sm lg:w-full" aria-hidden="true">
            <FaceCopyArt />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 sm:px-8" aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="label text-ash">
          Cómo funciona
        </h2>
        <ol className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-coal p-5 sm:p-6">
              <p className="label text-signal">0{index + 1}</p>
              <p className="display mt-2 text-2xl">{step.title}</p>
              <p className="mt-2 text-ash">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-12 w-full max-w-6xl px-5 sm:px-8" aria-labelledby="limites">
        <h2 id="limites" className="label text-ash">
          Lo que esta demo no hace
        </h2>
        <ul className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {limits.map(([title, text]) => (
            <li key={title} className="border-l-2 border-signal pl-4">
              <p className="font-bold">{title}</p>
              <p className="text-ash">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
