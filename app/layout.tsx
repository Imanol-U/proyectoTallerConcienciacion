import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

// Fuentes servidas desde nuestro dominio (nada se pide a terceros).
const archivo = localFont({
  src: "./fonts/Archivo-latin-variable.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-latin-variable.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "¿Eres tú? — Con una foto tuya basta para falsificarte en vídeo",
    template: "%s — ¿Eres tú?",
  },
  description:
    "Demo educativa sobre deepfakes: compruébalo en 60 segundos con tu propia cara. El vídeo lleva marca de agua y se borra en minutos.",
  applicationName: "¿Eres tú?",
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "¿Eres tú?",
    title: "Con una foto tuya basta para falsificarte en vídeo",
    description: "Compruébalo en 60 segundos, con tu propia cara. Demo educativa sobre deepfakes.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ink text-paper">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-paper focus:px-4 focus:py-2 focus:text-ink"
        >
          Saltar al contenido
        </a>

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
          <Link href="/" className="display text-[1.7rem] no-underline" aria-label="¿Eres tú? — inicio">
            ¿Eres <span className="text-signal">tú</span>?
          </Link>
          <p className="label text-right text-ash">
            Demo educativa <span className="hidden sm:inline">sobre deepfakes</span>
          </p>
        </header>

        <main id="contenido" className="flex flex-1 flex-col">
          <noscript>
            <p className="mx-auto mt-10 max-w-xl rounded-lg border border-warn bg-warn-deep p-4 text-center">
              Esta demo necesita JavaScript para usar la cámara y generar el vídeo. Actívalo en tu navegador y
              recarga la página.
            </p>
          </noscript>
          {children}
        </main>

        <footer className="mx-auto w-full max-w-6xl px-5 pb-8 pt-14 sm:px-8">
          <div className="flex flex-col gap-3 border-t border-line pt-6 text-sm text-ash sm:flex-row sm:items-center sm:justify-between">
            <p>
              Sin cookies. Sin analítica. Sin registro.{" "}
              <Link href="/privacidad" className="text-paper underline">
                Aviso de privacidad
              </Link>
            </p>
            <p className="label">Vídeo generado con IA · demo educativa</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
