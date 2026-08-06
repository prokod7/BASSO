import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ sector: z.enum(["kitchen", "bar", "counter", "all"]).default("all"), reason: z.string().min(2).max(300) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "kitchen", "bar"], "kds.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { error: queueError } = await db.rpc("enqueue_order_print_jobs", { p_order_id: id });
    if (queueError) throw queueError;
    if (body.sector !== "all") await db.from("print_jobs").update({ status: "cancelled" }).eq("order_id", id).eq("status", "queued").neq("sector", body.sector);
    await db.from("print_jobs").update({ is_reprint: true }).eq("order_id", id).eq("status", "queued");
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "ORDER_REPRINT_REQUESTED", entity_type: "order", entity_id: id, reason: body.reason, after_data: { sector: body.sector } });
    return NextResponse.json({ queued: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao solicitar impressão." }, { status: 400 });
  }
}
