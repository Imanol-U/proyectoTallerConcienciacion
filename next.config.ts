import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Política de seguridad de contenido.
 *
 * Todo sale de nuestro propio dominio: ni analítica, ni fuentes externas, ni
 * CDN de terceros. El detector de caras (WebAssembly) y su modelo también se
 * sirven desde aquí, y `connect-src 'self'` garantiza técnicamente que el
 * navegador no puede enviar la foto a ningún otro sitio.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': compilar el detector de caras. 'unsafe-eval' solo en
  // desarrollo (lo usa React para depurar).
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  // En desarrollo, la recarga en caliente usa un WebSocket; algunos navegadores
  // no lo consideran incluido en 'self'.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // Solo la cámara, y solo para esta página. Nunca el micrófono.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), display-capture=(), payment=(), usb=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  // Servidor mínimo y autocontenido para la imagen Docker.
  output: "standalone",
  poweredByHeader: false,
  // En desarrollo, permitir abrir la web por IP además de por "localhost"
  // (si no, Next.js bloquea sus recursos y los botones no responden).
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "*.local"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // El detector de caras y su modelo no cambian entre visitas.
        source: "/(mediapipe|models)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
