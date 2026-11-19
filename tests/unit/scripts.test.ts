import { describe, expect, it } from "vitest";
import { ANIMATION_IDS, ANIMATIONS, isAnimationId } from "@/lib/animations";
import { formatCost, WAITING_FACTS } from "@/lib/texts";

describe("lista blanca de animaciones", () => {
  it("son exactamente las seis del plan, con su duración", () => {
    expect(ANIMATION_IDS).toEqual(["saludo", "sonrisa", "sorpresa", "guino", "teletransporte", "escenario"]);
    expect(ANIMATION_IDS.map((id) => ANIMATIONS[id].seconds)).toEqual([4, 4, 4, 5, 10, 10]);
    expect(ANIMATIONS.saludo.description).toBe("Asentir y sonreír");
    expect(ANIMATIONS.sonrisa.description).toBe("De serio a sonrisa amplia");
    expect(ANIMATIONS.sorpresa.description).toBe("Cejas arriba, boca abierta");
    expect(ANIMATIONS.guino.description).toBe("Guiño y giro leve de cabeza");
  });

  it("solo acepta claves propias de la lista", () => {
    for (const id of ANIMATION_IDS) expect(isAnimationId(id)).toBe(true);
    for (const bad of ["", "Saludo", "constructor", "toString", "__proto__", "hasOwnProperty", null, undefined, 3, {}]) {
      expect(isAnimationId(bad)).toBe(false);
    }
  });

  it("ninguna animación dura más de 15 segundos y todas tienen miniatura", () => {
    for (const id of ANIMATION_IDS) {
      expect(ANIMATIONS[id].seconds).toBeLessThanOrEqual(15);
      expect(ANIMATIONS[id].preview).toBe(`/previews/${id}.mp4`);
    }
  });
});

describe("textos", () => {
  it("no inventa un coste si no se ha medido", () => {
    expect(formatCost(null)).toBe("céntimos");
    expect(formatCost(0.004)).toBe("< 1 cént.");
    expect(formatCost(0.02)).toMatch(/^0,02\s€$/);
    expect(formatCost(0.153)).toMatch(/^0,15\s€$/);
  });

  it("los datos de la espera incluyen los dos del plan", () => {
    expect(WAITING_FACTS.some((fact) => fact.startsWith("Esto lo hace un servicio comercial"))).toBe(true);
    expect(WAITING_FACTS.some((fact) => fact.startsWith("No hemos necesitado tu voz ni más fotos"))).toBe(true);
    expect(WAITING_FACTS.length).toBeGreaterThanOrEqual(5);
  });
});
