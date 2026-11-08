import { secretMatches } from "@/lib/whatsapp/domain";
import { processQueue } from "@/lib/whatsapp/worker";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Para um agendador externo (opcional). Exige Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !secretMatches(request.headers.get("authorization") ?? "", `Bearer ${process.env.CRON_SECRET}`))
    return new Response("Forbidden", { status: 403 });
  return Response.json(await processQueue());
}
