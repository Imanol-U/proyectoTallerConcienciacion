import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto w-full max-w-2xl animate-rise px-5 pt-12 sm:px-8 sm:pt-20" aria-labelledby="no-existe">
      <p className="label text-signal">Error 404</p>
      <h1 id="no-existe" className="display mt-3 text-5xl sm:text-6xl">
        Esta página no existe.
      </h1>
      <p className="mt-4 text-xl text-paper/85">
        Puede que el enlace esté mal escrito o que la página se haya movido.
      </p>
      <p className="mt-8">
        <Link
          href="/"
          className="inline-flex min-h-13 items-center rounded-lg bg-signal px-6 py-3 font-bold text-ink hover:bg-paper"
        >
          Ir a la demo
        </Link>
      </p>
    </section>
  );
}
