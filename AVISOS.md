# Avisos de terceros

Componentes de terceros que se distribuyen con este proyecto o que usa en ejecución.

## Incluidos en el repositorio

| Componente | Dónde | Licencia |
| --- | --- | --- |
| **Inter** (Bold), de The Inter Project Authors | `fonts/Inter-Bold.ttf` — texto de la marca de agua | SIL Open Font License 1.1 (`fonts/Inter-LICENSE-OFL.txt`) |
| **Archivo**, de The Archivo Project Authors | `app/fonts/Archivo-latin-variable.woff2` — tipografía de la interfaz | SIL Open Font License 1.1 (`app/fonts/Archivo-LICENSE-OFL.txt`) |
| **JetBrains Mono**, de The JetBrains Mono Project Authors | `app/fonts/JetBrainsMono-latin-variable.woff2` — etiquetas | SIL Open Font License 1.1 (`app/fonts/JetBrainsMono-LICENSE-OFL.txt`) |
| **BlazeFace (short range)**, de Google | `public/models/blaze_face_short_range.tflite` — detector de caras | Apache License 2.0 |

Las fuentes de la interfaz proceden de los paquetes `@fontsource-variable/archivo` y `@fontsource-variable/jetbrains-mono`; Inter Bold, del paquete `@expo-google-fonts/inter`. El modelo se descargó de `storage.googleapis.com/mediapipe-models`.

## Dependencias (npm)

| Paquete | Uso | Licencia |
| --- | --- | --- |
| `next`, `react`, `react-dom` | Aplicación web | MIT |
| `@mediapipe/tasks-vision` | Detección facial en el navegador (su motor WebAssembly se copia a `public/mediapipe` al compilar) | Apache License 2.0 |
| `tailwindcss` | Estilos | MIT |

## Servicios y herramientas externas

| Componente | Uso | Notas |
| --- | --- | --- |
| **Grok Imagine Video 1.5 Lite**, de xAI | Modelo que anima la foto en los cuatro gestos | Servicio de pago, sujeto a las condiciones de xAI. |
| **Grok Imagine Video**, de xAI | Modelo de las dos escenas (foto como referencia de identidad) | Servicio de pago, sujeto a las condiciones de xAI. |
| **OpenRouter** | Intermediario por el que se llama al modelo | Sujeto a sus condiciones de servicio y a su política de privacidad. |
| **ffmpeg** | Quema la marca de agua | Se instala en el sistema (no se distribuye con el código). La compilación de Ubuntu incluye componentes GPL. |

## Imágenes de prueba

Todo lo que hay en `tests/fixtures` y las miniaturas de `public/previews` son dibujos generados por programa (`tests/fixtures/generar.py`, `scripts/make-placeholders.mjs`). No aparece ninguna persona real.
