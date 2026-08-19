import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager","viewer"], "audit.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const limit = Math.min(1000, Math.max(50, Number(request.nextUrl.searchParams.get("limit") || 500)));
    const { data, error } = await db.from("audit_logs").select("id,actor_label,action,entity_type,entity_id,origin,reason,before_data,after_data,created_at").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    const entries = (data || []).map((row: any) => ({ id: String(row.id), actor: row.actor_label || "Sistema", action: row.action, entity: row.entity_type, entityId: row.entity_id, origin: row.origin, createdAt: row.created_at, details: row.reason || undefined, before: row.before_data || undefined, after: row.after_data || undefined }));
    return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar auditoria." }, { status: 400 });
  }
}
