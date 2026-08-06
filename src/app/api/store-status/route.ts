import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  operationalStatus: z.enum(["open", "paused", "closed"]),
  acceptingOrders: z.boolean(),
  pauseReason: z.string().max(300).nullable().optional(),
  manualOverride: z.boolean().default(true),
});

export async function GET() {
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("store_runtime_status").select("*").eq("id", true).single();
    if (error) throw error;
    return NextResponse.json({ operationalStatus: data.operational_status, acceptingOrders: data.accepting_orders, pauseReason: data.pause_reason || undefined, manualOverride: data.manual_override, updatedAt: data.updated_at });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar loja." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter"], "orders.edit");
    const body = schema.parse(await request.json());
    if (auth.role !== "manager" && body.operationalStatus === "closed") throw new Error("Somente o gestor pode fechar a loja manualmente.");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const patch = { operational_status: body.operationalStatus, accepting_orders: body.acceptingOrders, pause_reason: body.pauseReason || null, manual_override: body.manualOverride, updated_by: auth.userId === "demo" ? null : auth.userId, updated_at: new Date().toISOString() };
    const { error } = await db.from("store_runtime_status").update(patch).eq("id", true);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "STORE_RUNTIME_STATUS_CHANGED", entity_type: "store", entity_id: "main", reason: body.pauseReason || undefined, after_data: patch });
    return NextResponse.json({ updated: true, ...body, updatedAt: patch.updated_at });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao alterar a loja." }, { status: 400 });
  }
}
