import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkLimits,
  consume,
  getDailyCount,
  peekLimits,
  resetRateLimitForTests,
  secondsUntilReset,
} from "@/lib/rateLimit";

describe("límite de abuso", () => {
  beforeEach(() => {
    resetRateLimitForTests();
    process.env.MAX_PER_IP_PER_DAY = "3";
    process.env.MAX_GLOBAL_PER_DAY = "200";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.MAX_PER_IP_PER_DAY;
    delete process.env.MAX_GLOBAL_PER_DAY;
  });

  it("permite 3 vídeos por IP y rechaza el cuarto", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(checkLimits("203.0.113.7")).toBe(true);
      const slot = consume("203.0.113.7");
      expect(slot.ok).toBe(true);
      if (slot.ok) expect(slot.remaining).toBe(2 - i);
    }
    expect(checkLimits("203.0.113.7")).toBe(false);
    expect(peekLimits("203.0.113.7")).toBe("ip");
    expect(consume("203.0.113.7")).toEqual({ ok: false, scope: "ip" });

    // Otra IP no se ve afectada.
    expect(checkLimits("203.0.113.8")).toBe(true);
  });

  it("consultar no consume", () => {
    for (let i = 0; i < 50; i += 1) checkLimits("203.0.113.7");
    expect(consume("203.0.113.7").ok).toBe(true);
    expect(getDailyCount().videos).toBe(1);
  });

  it("aplica el tope global aunque cambien las IP", () => {
    process.env.MAX_GLOBAL_PER_DAY = "5";
    for (let i = 0; i < 5; i += 1) expect(consume(`198.51.100.${i}`).ok).toBe(true);
    expect(consume("198.51.100.99")).toEqual({ ok: false, scope: "global" });
    expect(peekLimits("198.51.100.99")).toBe("global");
  });

  it("devuelve el intento a la IP sin tocar el contador global", () => {
    const slot = consume("203.0.113.7");
    if (!slot.ok) throw new Error("debería permitirlo");
    slot.refundIp();
    slot.refundIp(); // repetir no descuenta dos veces
    expect(getDailyCount().videos).toBe(1);
    for (let i = 0; i < 3; i += 1) expect(consume("203.0.113.7").ok).toBe(true);
    expect(consume("203.0.113.7").ok).toBe(false);
  });

  it("devuelve el hueco global cuando no hubo coste", () => {
    process.env.MAX_GLOBAL_PER_DAY = "1";
    const slot = consume("203.0.113.7");
    if (!slot.ok) throw new Error("debería permitirlo");
    expect(consume("203.0.113.8").ok).toBe(false);
    slot.refundGlobal();
    slot.refundGlobal();
    expect(getDailyCount().videos).toBe(0);
    expect(consume("203.0.113.8").ok).toBe(true);
  });

  it("se reinicia al cambiar de día (UTC)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T23:59:00Z"));
    for (let i = 0; i < 3; i += 1) consume("203.0.113.7");
    expect(checkLimits("203.0.113.7")).toBe(false);
    expect(secondsUntilReset()).toBe(60);

    vi.setSystemTime(new Date("2026-03-11T00:00:01Z"));
    expect(checkLimits("203.0.113.7")).toBe(true);
    expect(getDailyCount()).toEqual({ day: "2026-03-11", videos: 0 });
  });

  it("una devolución de ayer no altera los contadores de hoy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T23:59:00Z"));
    const slot = consume("203.0.113.7");
    if (!slot.ok) throw new Error("debería permitirlo");

    vi.setSystemTime(new Date("2026-03-11T00:00:01Z"));
    consume("203.0.113.7");
    slot.refundIp();
    slot.refundGlobal();
    expect(getDailyCount().videos).toBe(1);
  });

  it("con un valor inválido usa el límite por defecto, no 'sin límite'", () => {
    process.env.MAX_PER_IP_PER_DAY = "muchos";
    for (let i = 0; i < 3; i += 1) expect(consume("203.0.113.7").ok).toBe(true);
    expect(consume("203.0.113.7").ok).toBe(false);
  });

  it("no guarda la IP en claro", () => {
    consume("203.0.113.77");
    const state = (globalThis as { __eresTuRateLimit?: { perIp: Map<string, number> } })
      .__eresTuRateLimit;
    const keys = [...(state?.perIp.keys() ?? [])];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain("203.0.113.77");
  });
});
