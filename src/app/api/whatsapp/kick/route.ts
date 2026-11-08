import { NextResponse, after } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabled } from "@/lib/whatsapp/config";
import { processQueue } from "@/lib/whatsapp/worker";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Recuperação sem agendador: o painel aberto na loja chama esta rota a cada minuto.
 * Só processa quando há mensagem parada há mais de 45 s; senão é uma consulta barata.
 */
export async function POST() {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]);
  } catch {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }
  if (!enabled()) return NextResponse.json({ idle: true });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ idle: true });
  const { data, error } = await db
    .from("wa_jobs")
    .select("id, wa_sessions!inner(paused)")
    .eq("wa_sessions.paused", false)
    .in("state", ["queued", "processing"])
    .lt("attempts", 3)
    .lt("created_at", new Date(Date.now() - 45000).toISOString())
    .limit(1);
  if (error || !data?.length) return NextResponse.json({ idle: true });
  after(async () => {
    try { await processQueue({ budgetMs: 75000 }); } catch { console.error("whatsapp_kick_failed"); }
  });
  return NextResponse.json({ kicked: true });
}
