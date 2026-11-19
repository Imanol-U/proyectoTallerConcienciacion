import { connection } from "next/server";
import { Suspense } from "react";
import { DemoPaused } from "@/components/DemoPaused";
import { Wizard } from "@/components/Wizard";
import { getConfig } from "@/lib/config";

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <p className="label animate-blink text-ash">Cargando…</p>
    </div>
  );
}

/** Aviso del modo de demostración local (npm run demo:simulada). */
function SimulatedBanner() {
  return (
    <p
      role="note"
      className="label mx-auto mt-4 w-fit max-w-[92vw] rounded-md border border-ok/60 bg-ok-deep px-3 py-2 text-center text-ok"
      data-testid="aviso-simulado"
    >
      Modo simulado · el vídeo final es una muestra, no tu cara
    </p>
  );
}

async function Demo() {
  // Los interruptores (DEMO_ENABLED, UPLOAD_ENABLED…) se leen en cada visita,
  // no al compilar: apagar la demo es cambiar una variable de entorno.
  await connection();
  const config = getConfig();
  if (!config.demoEnabled) return <DemoPaused />;

  return (
    <>
      {process.env.MODELO_SIMULADO === "true" ? <SimulatedBanner /> : null}
      <Wizard
        uploadEnabled={config.uploadEnabled}
        costPerVideoEur={config.costPerVideoEur ?? null}
        retentionMinutes={Math.max(1, Math.round(config.videoTtlSeconds / 60))}
      />
    </>
  );
}

/** Asistente de 5 pasos; el estado vive en el navegador (components/Wizard.tsx). */
export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Demo />
    </Suspense>
  );
}
