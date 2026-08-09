import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_ordered") }),
  z.object({ action: z.literal("cancel"), reason: z.string().min(2).max(1000) }),
  z.object({ action: z.literal("receive"), items: z.array(z.object({ itemId: z.string().uuid(), receivedQuantity: z.number().positive(), expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD").nullable().optional() })).min(1) }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "finance"], "inventory.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const actorId = auth.userId === "demo" ? null : auth.userId;

    if (body.action === "receive") {
      const { data, error } = await db.rpc("receive_purchase_order", { p_order_id: id, p_items: body.items, p_actor_id: actorId });
      if (error) throw error;
      return NextResponse.json({ saved: true, status: data });
    }

    const { data: current, error: currentError } = await db.from("purchase_orders").select("*").eq("id", id).single();
    if (currentError) throw currentError;
    if (current.status === "received" || current.status === "cancelled") throw new Error("Este pedido de compra já foi finalizado.");
    const nextStatus = body.action === "mark_ordered" ? "ordered" : "cancelled";
    const { error } = await db.from("purchase_orders").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: actorId,
      actor_label: auth.displayName,
      action: body.action === "mark_ordered" ? "PURCHASE_ORDER_SENT" : "PURCHASE_ORDER_CANCELLED",
      entity_type: "purchase_order",
      entity_id: id,
      reason: body.action === "cancel" ? body.reason : null,
      before_data: current,
      after_data: { status: nextStatus },
    });
    return NextResponse.json({ saved: true, status: nextStatus });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar compra." }, { status: 400 });
  }
}
