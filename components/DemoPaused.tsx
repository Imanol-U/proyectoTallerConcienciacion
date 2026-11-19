import { EducationBlocks } from "./EducationBlocks";

/**
 * Pantalla "demo en pausa": se muestra cuando DEMO_ENABLED no es "true"
 * (interruptor de apagado). Lo que se puede aprender sin generar nada sigue
 * estando disponible.
 */
export function DemoPaused() {
  return (
    <section
      className="mx-auto w-full max-w-2xl animate-rise px-5 pt-10 sm:px-8 sm:pt-16"
      aria-labelledby="pausa-titulo"
      data-testid="demo-en-pausa"
    >
      <p className="label text-signal">Interruptor apagado</p>
      <h1 id="pausa-titulo" className="display mt-3 text-5xl sm:text-6xl">
        Demo en pausa.
      </h1>
      <p className="mt-4 text-xl text-paper/85">
        Ahora mismo no se pueden generar vídeos. Vuelve a intentarlo más tarde.
      </p>
      <p className="mt-2 text-ash">
        La idea, eso sí, cabe en una frase: con una sola foto tuya, cualquiera puede fabricar un vídeo en el
        que pareces hacer algo que nunca has hecho.
      </p>
      <div className="mt-10 space-y-5">
        <EducationBlocks />
      </div>
    </section>
  );
}
