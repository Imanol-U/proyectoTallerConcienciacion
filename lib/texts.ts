/**
 * Textos educativos de la demo.
 * Están juntos en un solo fichero para poder revisarlos (o traducirlos) sin
 * tocar los componentes.
 */

/** Datos que van rotando mientras se genera el vídeo. */
export const WAITING_FACTS: readonly string[] = [
  "Esto lo hace un servicio comercial al alcance de cualquiera, por unos céntimos.",
  "No hemos necesitado tu voz ni más fotos. Con una ha bastado.",
  "A la IA solo le hemos dado tu foto y una frase que describe el gesto.",
  "Hace pocos años, hacer esto exigía un equipo de efectos especiales.",
  "La foto de perfil de cualquier red social serviría igual que la que acabas de usar.",
  "El vídeo que vas a ver avisa en grande de que es falso. Los de verdad no avisan.",
  "En nuestro servidor tu foto no se guarda: se usa para este vídeo y se descarta.",
];

export interface HelpLink {
  label: string;
  href: string;
}

export interface EducationBlock {
  id: "paso" | "detectar" | "ayuda";
  title: string;
  points: ReadonlyArray<{ lead: string; text: string; links?: readonly HelpLink[] }>;
}

export const HOW_TO_SPOT: EducationBlock = {
  id: "detectar",
  title: "Cómo detectarlo",
  points: [
    {
      lead: "Parpadeo y dientes raros.",
      text: "Ojos que no parpadean con naturalidad, dientes borrosos o que cambian de forma de un instante a otro.",
    },
    {
      lead: "Bordes de la cara y el pelo.",
      text: "Contornos que tiemblan, se difuminan o no terminan de encajar con el fondo.",
    },
    {
      lead: "Luz que no cuadra.",
      text: "Sombras y brillos en la cara que no coinciden con los del resto de la escena.",
    },
    {
      lead: "Y, sobre todo, comprueba la fuente.",
      text: "¿Quién lo publica? ¿Lo confirma algún medio o persona fiable? Los fallos visuales irán desapareciendo; preguntarse de dónde sale un vídeo seguirá funcionando.",
    },
  ],
};

export const IF_IT_HAPPENS: EducationBlock = {
  id: "ayuda",
  title: "Si te pasa a ti",
  points: [
    {
      lead: "Guarda pruebas.",
      text: "Capturas de pantalla, enlaces, fechas y nombres de usuario, antes de que el contenido desaparezca.",
    },
    {
      lead: "Denúncialo en la plataforma.",
      text: "Todas las redes y servicios de mensajería tienen un formulario para pedir la retirada de contenido que suplanta tu identidad.",
    },
    {
      lead: "Acude al canal oficial de ayuda de tu país.",
      text: "En España, el 017 de INCIBE es gratuito y confidencial, y el Canal Prioritario de la AEPD tramita la retirada urgente de contenido sexual o violento difundido sin permiso. Si crees que hay delito, denuncia ante la Policía o la Guardia Civil.",
      links: [
        { label: "017 · Línea de ayuda de INCIBE", href: "https://www.incibe.es/linea-de-ayuda-en-ciberseguridad" },
        { label: "Canal Prioritario de la AEPD", href: "https://www.aepd.es/canalprioritario" },
      ],
    },
  ],
};

/**
 * Coste aproximado de un vídeo, para la cifra grande del resultado.
 * Sin medición (COST_PER_VIDEO_EUR sin definir) no se inventa una cifra.
 */
export function formatCost(costPerVideoEur: number | null): string {
  if (costPerVideoEur === null) return "céntimos";
  if (costPerVideoEur < 0.01) return "< 1 cént.";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(costPerVideoEur);
}
