import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description: "Qué se envía, a quién, cuánto dura y cómo se borra en la demo «¿Eres tú?».",
};

/** Fecha de la última revisión de este texto. Actualízala al cambiarlo. */
const LAST_UPDATED = "noviembre de 2026";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-7">
      <h2 id={id} className="display text-3xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-paper/90 [&_a]:underline [&_li]:pl-1 [&_strong]:text-paper [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </div>
    </section>
  );
}

function Pending({ what }: { what: string }) {
  return (
    <mark className="rounded bg-warn px-1.5 py-0.5 font-semibold text-ink" data-testid="pendiente">
      [{what}: pendiente de completar]
    </mark>
  );
}

/** Datos que dependen del despliegue: se leen en cada visita. */
async function Controller() {
  await connection();
  const { orgName, contactEmail, maxPerIpPerDay } = getConfig();
  return (
    <>
      <p>
        El responsable del tratamiento es{" "}
        {orgName ? <strong>{orgName}</strong> : <Pending what="nombre de la organización" />}.
      </p>
      <p>
        Para cualquier consulta sobre tus datos o para ejercer tus derechos, escribe a{" "}
        {contactEmail ? (
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        ) : (
          <Pending what="correo de contacto" />
        )}
        .
      </p>
      <p className="text-sm text-ash">
        Límite de uso actual: {maxPerIpPerDay} {maxPerIpPerDay === 1 ? "vídeo" : "vídeos"} por conexión y día.
      </p>
    </>
  );
}

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-2xl animate-rise space-y-8 px-5 pt-8 sm:px-8 sm:pt-12">
      <header>
        <p className="label text-ash">Aviso de privacidad</p>
        <h1 className="display mt-3 text-5xl sm:text-6xl">Qué pasa con tu foto.</h1>
        <p className="mt-4 text-xl text-paper/85">
          Versión corta: tu foto se usa para generar un único vídeo y se borra. No guardamos nada con lo que
          se te pueda reconocer pasados 10 minutos.
        </p>
        <p className="mt-5">
          <Link href="/" className="font-semibold underline">
            ← Volver a la demo
          </Link>
        </p>
      </header>

      <Section id="resumen" title="En resumen">
        <ul>
          <li>
            <strong>Qué se envía:</strong> una foto de tu cara, recortada a 512×512 píxeles y sin metadatos
            (ni ubicación, ni fecha, ni modelo de móvil).
          </li>
          <li>
            <strong>A quién:</strong> a nuestro servidor y, desde él, a OpenRouter y xAI, el servicio de inteligencia
            artificial que genera el vídeo.
          </li>
          <li>
            <strong>Cuánto dura:</strong> en nuestro servidor, 10 minutos como máximo. La foto no se guarda en nuestro servidor; el
            vídeo se borra solo a los 10 minutos.
          </li>
          <li>
            <strong>Cómo borrar:</strong> con el botón «Borrar mis datos ahora», o simplemente cerrando la
            página.
          </li>
          <li>
            <strong>Sin cookies, sin analítica, sin registro.</strong> No te pedimos nombre ni correo.
          </li>
        </ul>
      </Section>

      <Section id="responsable" title="Quién es el responsable">
        <Suspense fallback={<p className="text-ash">Cargando…</p>}>
          <Controller />
        </Suspense>
      </Section>

      <Section id="datos" title="Qué datos tratamos y para qué">
        <ul>
          <li>
            <strong>Tu foto.</strong> Es la imagen de tu cara y la tratamos como un dato especialmente
            sensible. La usamos con una única finalidad: generar el vídeo de esta demostración. No se usa
            para entrenar modelos, ni para identificarte, ni para ninguna otra cosa.
          </li>
          <li>
            <strong>El vídeo generado.</strong> Dura entre 4 y 10 segundos, no tiene sonido y lleva quemada sobre
            la imagen la franja «Generado por IA - demo educativa». La versión sin marca que devuelve el modelo no sale nunca de
            nuestro servidor y se descarta en cuanto se le quema la marca.
          </li>
          <li>
            <strong>Tu dirección IP.</strong> Solo para limitar el abuso (un número máximo de vídeos por
            conexión y día). No guardamos la IP: guardamos en memoria una huella irreversible de ella, que
            se descarta al acabar el día y no se asocia a tu foto.
          </li>
          <li>
            <strong>Un contador anónimo.</strong> Cuántos vídeos se generan cada día. Nada más.
          </li>
        </ul>
        <p>
          No tratamos tu nombre, tu correo, tu voz ni ningún audio. Tampoco los metadatos de la foto: se
          eliminan en tu propio dispositivo antes de enviarla.
        </p>
      </Section>

      <Section id="base-legal" title="Con qué permiso">
        <p>
          Con tu <strong>consentimiento explícito</strong>: las tres casillas que marcas antes de hacerte la
          foto. Sin ellas, la demo no continúa y no se envía nada.
        </p>
        <p>
          Puedes retirar el consentimiento en cualquier momento pulsando «Borrar mis datos ahora» o cerrando
          la página.
        </p>
      </Section>

      <Section id="destinatarios" title="A quién se envía">
        <ul>
          <li>
            <strong>OpenRouter</strong> (OpenRouter, Inc., Estados Unidos) y, a través de él,{" "}
            <strong>xAI</strong>, que ejecuta el modelo de vídeo (Grok Imagine). Tu foto se les envía dentro
            de la petición, únicamente para generar el vídeo; no la subimos a ningún almacenamiento aparte.
            Cuánto tiempo la conservan y para qué depende de sus propias políticas de privacidad, que no
            controlamos. Esto supone una transferencia de datos a Estados Unidos.
          </li>
          <li>
            <strong>Nuestro proveedor de alojamiento</strong>, donde se ejecuta esta web. Solo conserva el
            vídeo ya marcado, en un disco temporal, durante esos 10 minutos.
          </li>
        </ul>
        <p>No compartimos tus datos con nadie más, ni los vendemos, ni los usamos con fines publicitarios.</p>
      </Section>

      <Section id="plazos" title="Cuánto tiempo se conserva">
        <ul>
          <li>
            <strong>La foto:</strong> en nuestro servidor solo está en memoria mientras se genera el vídeo
            (normalmente menos de un minuto) y nunca se escribe en disco. Los proveedores de IA la reciben para generar el vídeo y aplican sus propias políticas de conservación.
          </li>
          <li>
            <strong>El vídeo:</strong> 10 minutos como máximo. Se borra antes si pulsas «Borrar mis datos
            ahora» o si generas otro, y pedimos su borrado en cuanto cierras la página.
          </li>
          <li>
            <strong>La huella de tu IP:</strong> hasta el final del día, solo en memoria.
          </li>
          <li>
            <strong>Registros técnicos:</strong> no contienen imágenes, ni direcciones IP, ni
            identificadores de vídeos.
          </li>
        </ul>
      </Section>

      <Section id="borrar" title="Cómo borrar tus datos">
        <ul>
          <li>
            En la pantalla del resultado, pulsa <strong>«Borrar mis datos ahora»</strong>: el vídeo se
            elimina del servidor al instante y la foto desaparece de la página.
          </li>
          <li>Si cierras o recargas la página, pedimos el borrado del vídeo en ese mismo momento.</li>
          <li>Si no haces nada, todo se borra solo a los 10 minutos.</li>
        </ul>
      </Section>

      <Section id="limites" title="Lo que no podemos garantizar">
        <p>
          Te pedimos que uses solo tu propia cara, pero no tenemos forma técnica de comprobar de quién es
          una foto. Por eso el resto de límites no se relajan nunca: el vídeo lleva la franja «Generado por IA»,
          los gestos son fijos e inofensivos, no hay audio, no se ofrece descarga y hay un tope de vídeos por
          día.
        </p>
        <p>
          La demo es solo para <strong>mayores de 18 años</strong>. Si crees que alguien ha usado aquí una
          foto tuya sin permiso, escríbenos.
        </p>
      </Section>

      <Section id="derechos" title="Tus derechos">
        <p>
          Puedes pedirnos acceder a tus datos, rectificarlos, suprimirlos, limitar u oponerte a su
          tratamiento y solicitar su portabilidad, escribiendo al contacto indicado arriba. Ten en cuenta
          que, pasados 10 minutos, ya no conservamos nada que permita relacionar una petición contigo.
        </p>
        <p>
          Si consideras que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de
          Protección de Datos (
          <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
            www.aepd.es
          </a>
          ) o ante la autoridad de protección de datos de tu país.
        </p>
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          Ninguna. Esta web no instala cookies, no usa analítica y no carga nada de terceros: ni fuentes, ni
          scripts, ni píxeles de seguimiento. Incluso el detector de caras se descarga desde aquí y se
          ejecuta en tu dispositivo.
        </p>
      </Section>

      <footer className="border-t border-line pt-6 text-sm text-ash">
        <p>Última actualización: {LAST_UPDATED}.</p>
      </footer>
    </article>
  );
}
