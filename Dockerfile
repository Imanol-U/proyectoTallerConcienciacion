# syntax=docker/dockerfile:1
#
# ¿Eres tú? — imagen de producción (Railway, Fly.io o cualquier servidor con Docker)
#
# Tres etapas: instalar dependencias, compilar y ejecutar. La imagen final solo
# lleva Node.js, ffmpeg y la aplicación ya compilada: ni código fuente, ni
# dependencias de desarrollo, ni pruebas.
#
#   docker build -t eres-tu .
#   docker run --rm -p 3000:3000 --env-file .env.local eres-tu

# Imagen oficial de Node.js para instalar y compilar. Se puede fijar otra
# versión (o un espejo propio) con --build-arg NODE_IMAGE=…
ARG NODE_IMAGE=node:24-bookworm-slim

# ---- 1. Dependencias ---------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 2. Compilación ----------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` copia antes el detector de caras a public/ y, al terminar,
# deja en .next/standalone todo lo necesario: servidor, public/, estáticos y fonts/.
RUN npm run build

# ---- 3. Ejecución ------------------------------------------------------------
# Ubuntu 24.04: su ffmpeg trae el filtro drawtext y libx264, que es lo que
# necesita la marca de agua.
FROM ubuntu:24.04 AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # Docker pone en HOSTNAME el id del contenedor; Next.js lo usaría como
    # dirección de escucha. Hay que fijarlo para aceptar conexiones de fuera.
    HOSTNAME=0.0.0.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 --create-home --shell /usr/sbin/nologin app

# El mismo Node.js con el que se ha compilado.
COPY --from=build /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
# Incluye /app/fonts/Inter-Bold.ttf (marca de agua) y /app/public/driving (vídeos guía).
COPY --from=build --chown=app:app /app/.next/standalone ./

# Sin privilegios: la aplicación solo escribe en el directorio temporal.
USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server.js"]
