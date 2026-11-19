import { afterEach, describe, expect, it } from "vitest";
import { getClientIp, normalizeIp, UNKNOWN_IP } from "@/lib/clientIp";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/generate", { method: "POST", headers });
}

const PLATFORM_VARS = [
  "CLIENT_IP_HEADER",
  "FLY_APP_NAME",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_PROJECT_ID",
];

describe("IP del cliente", () => {
  afterEach(() => {
    for (const name of PLATFORM_VARS) delete process.env[name];
  });

  it("normaliza IPv4, puertos y direcciones IPv4 incrustadas", () => {
    expect(normalizeIp(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(normalizeIp("203.0.113.7:54321")).toBe("203.0.113.7");
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("agrupa IPv6 por prefijo /64", () => {
    const a = normalizeIp("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = normalizeIp("2001:DB8:ABCD:0012::1");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(b).toBe(a);
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8:0:0::/64");
    expect(normalizeIp("2001:db8:abcd:13::1")).not.toBe(a);
    expect(normalizeIp("::1")).toBe("0:0:0:0::/64");
  });

  it("descarta valores que no son una IP", () => {
    for (const bad of ["", "   ", "unknown", "<script>", "999.1.1.1", "a".repeat(200), null, undefined]) {
      expect(normalizeIp(bad)).toBeNull();
    }
  });

  it("usa el ÚLTIMO valor de X-Forwarded-For (el primero lo escribe el cliente)", () => {
    const spoofed = request({ "x-forwarded-for": "1.2.3.4, 198.51.100.20" });
    expect(getClientIp(spoofed)).toBe("198.51.100.20");

    // Cambiar el valor inventado no cambia el cubo del límite.
    const again = request({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 198.51.100.20" });
    expect(getClientIp(again)).toBe("198.51.100.20");
  });

  it("sin cabeceras cae en el cubo compartido", () => {
    expect(getClientIp(request({}))).toBe(UNKNOWN_IP);
    expect(getClientIp(request({ "x-forwarded-for": "no-es-una-ip" }))).toBe(UNKNOWN_IP);
  });

  it("en Fly.io se fía solo de Fly-Client-IP", () => {
    process.env.FLY_APP_NAME = "eres-tu";
    const req = request({ "fly-client-ip": "203.0.113.50", "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(req)).toBe("203.0.113.50");
    // Si falta la cabecera de la plataforma, no se recurre a una falsificable.
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4" }))).toBe(UNKNOWN_IP);
  });

  it("en Railway se fía de X-Real-IP", () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = "production";
    const req = request({ "x-real-ip": "203.0.113.60", "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(req)).toBe("203.0.113.60");
  });

  it("CLIENT_IP_HEADER manda sobre todo lo demás", () => {
    process.env.FLY_APP_NAME = "eres-tu";
    process.env.CLIENT_IP_HEADER = "CF-Connecting-IP";
    const req = request({
      "cf-connecting-ip": "203.0.113.70",
      "fly-client-ip": "172.16.0.1",
      "x-forwarded-for": "1.2.3.4",
    });
    expect(getClientIp(req)).toBe("203.0.113.70");
  });
});
