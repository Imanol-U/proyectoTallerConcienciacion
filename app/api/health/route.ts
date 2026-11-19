import { connection } from "next/server";

/** GET /api/health — comprobación de vida para la plataforma de despliegue. */
export async function GET(): Promise<Response> {
  // Se responde en cada petición (no se genera al compilar).
  await connection();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
