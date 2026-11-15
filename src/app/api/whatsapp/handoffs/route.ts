import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter"], "orders.view");
    const db = createAdminClient();
    if (!db) throw new Error("Banco não configurado.");
    const { data, error } = await db.from("wa_jobs")
      .select("id,session_id,delivered_at,wa_sessions!inner(name,phone,paused,read_at)")
      .eq("handoff", true).eq("wa_sessions.paused", true).not("delivered_at", "is", null)
      .gte("delivered_at", new Date(Date.now() - 24 * 3600000).toISOString())
      .order("delivered_at", { ascending: false }).limit(100);
    if (error) throw error;
    const seen = new Set<string>();
    const alerts = (data || []).flatMap((job: any) => {
      const session = job.wa_sessions;
      if (seen.has(job.session_id) || (session.read_at && session.read_at >= job.delivered_at)) return [];
      seen.add(job.session_id);
      return [{ id: job.id, sessionId: job.session_id, name: session.name || session.phone, at: job.delivered_at }];
    });
    return NextResponse.json({ alerts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar alertas." }, { status: 403 }); }
}
