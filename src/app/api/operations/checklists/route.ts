import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapChecklistItem, mapChecklistRun } from "@/lib/admin-control";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), phase: z.enum(["opening", "closing"]) }),
  z.object({ action: z.literal("complete"), runId: z.string().uuid(), notes: z.string().max(2000).optional() }),
  z.object({ action: z.literal("cancel"), runId: z.string().uuid(), notes: z.string().min(2).max(2000) }),
]);

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "finance", "viewer"], "settings.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const phase = request.nextUrl.searchParams.get("phase");
    let query = db
      .from("operational_checklist_runs")
      .select("*,started_profile:profiles!operational_checklist_runs_started_by_fkey(display_name),completed_profile:profiles!operational_checklist_runs_completed_by_fkey(display_name)")
      .order("started_at", { ascending: false })
      .limit(30);
    if (phase === "opening" || phase === "closing") query = query.eq("phase", phase);
    const { data: runs, error } = await query;
    if (error) throw error;
    const runIds = (runs || []).map((row: { id: string }) => row.id);
    const { data: items, error: itemsError } = runIds.length
      ? await db.from("operational_checklist_run_items").select("*").in("run_id", runIds).order("sort_order")
      : { data: [], error: null };
    if (itemsError) throw itemsError;
    const grouped = new Map<string, ReturnType<typeof mapChecklistItem>[]>();
    for (const raw of items || []) {
      const row = raw as Record<string, unknown>;
      const runId = String(row.run_id);
      const list = grouped.get(runId) || [];
      list.push(mapChecklistItem(row));
      grouped.set(runId, list);
    }
    return NextResponse.json({
      runs: (runs || []).map((row: Record<string, unknown>) => mapChecklistRun(row, grouped.get(String(row.id)) || [])),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar rotinas." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "finance"], "settings.manage");
    const body = actionSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    if (body.action === "start") {
      const { data, error } = await db.rpc("start_operational_checklist", { p_phase: body.phase, p_actor_id: auth.userId === "demo" ? null : auth.userId });
      if (error) throw error;
      return NextResponse.json({ runId: data });
    }
    if (body.action === "complete") {
      const { data, error } = await db.rpc("complete_operational_checklist", { p_run_id: body.runId, p_notes: body.notes || null, p_actor_id: auth.userId === "demo" ? null : auth.userId });
      if (error) throw error;
      return NextResponse.json({ completed: true, summary: data });
    }

    const { data: current, error: currentError } = await db.from("operational_checklist_runs").select("*").eq("id", body.runId).single();
    if (currentError) throw currentError;
    if (current.status !== "in_progress") throw new Error("Somente uma rotina em andamento pode ser cancelada.");
    const { error } = await db.from("operational_checklist_runs").update({ status: "cancelled", completed_by: auth.userId === "demo" ? null : auth.userId, completed_at: new Date().toISOString(), notes: body.notes }).eq("id", body.runId);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "OPERATIONAL_CHECKLIST_CANCELLED", entity_type: "checklist_run", entity_id: body.runId, reason: body.notes, before_data: current, after_data: { status: "cancelled" } });
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao alterar rotina." }, { status: 400 });
  }
}
