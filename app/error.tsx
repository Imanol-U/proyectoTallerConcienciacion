"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/** Red de seguridad: si algo inesperado rompe la página, se explica y se ofrece reintentar. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto w-full max-w-2xl px-5 pt-12 sm:px-8 sm:pt-20" aria-labelledby="error-titulo">
      <p className="label text-signal">Error inesperado</p>
      <h1 id="error-titulo" className="display mt-3 text-5xl sm:text-6xl">
        Algo se ha roto.
      </h1>
      <p className="mt-4 text-xl text-paper/85">
        No es culpa tuya. Puedes volver a intentarlo o recargar la página.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => retry()}>Reintentar</Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Recargar la página
        </Button>
      </div>
    </section>
  );
}
