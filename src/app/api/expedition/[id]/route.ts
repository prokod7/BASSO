import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ status: z.enum(["pending", "checking", "approved", "returned"]), notes: z.string().max(1000).optional() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "kitchen", "bar"], "orders.edit");
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    if (body.status === "returned" && !body.notes?.trim()) throw new Error("Informe o motivo da devolução para a produção.");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { error } = await db.rpc("set_order_expedition_status", { p_order_id: id, p_status: body.status, p_notes: body.notes || null, p_actor_id: auth.userId === "demo" ? null : auth.userId });
    if (error) throw error;
    if (body.status === "approved") {
      await db.from("internal_notifications").insert({ audience_role: "counter", category: "expedition", priority: "normal", title: "Pedido liberado pela expedição", body: `O pedido ${id} foi conferido e está pronto para retirada ou despacho.`, href: `/painel/pedidos?order=${id}`, metadata: { orderId: id } });
    }
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar expedição." }, { status: 400 });
  }
}
