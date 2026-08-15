import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactIntegrationValue } from "@/lib/integrations/core/safe-log";

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager"], "audit.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)));
    const { data, error } = await db.from("integration_events")
      .select("id,event_id,event_type,direction,status,attempts,last_error,next_attempt_at,external_order_id,correlation_id,created_at,processed_at,payload")
      .eq("provider", "99food")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ events: (data || []).map((row) => ({ ...row, payload: redactIntegrationValue(row.payload) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar logs." }, { status: 400 });
  }
}
