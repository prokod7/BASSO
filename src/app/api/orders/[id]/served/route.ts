import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter"], "orders.edit");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const { data: order, error: readError } = await db
      .from("orders")
      .select("id,number,channel,status,served_at,table_number")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (readError) throw readError;
    if (!["dine_in", "table_qr"].includes(order.channel)) throw new Error("Somente pedidos do salão podem ser marcados como servidos.");
    if (order.status !== "ready") throw new Error("O pedido precisa estar pronto antes de ser marcado como servido.");
    if (order.served_at) return NextResponse.json({ id, servedAt: order.served_at, duplicate: true });

    const servedAt = new Date().toISOString();
    const { error } = await db.from("orders").update({ served_at: servedAt, updated_at: servedAt }).eq("id", id);
    if (error) throw error;

    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName || "Garçom",
      action: "ORDER_SERVED",
      entity_type: "order",
      entity_id: id,
      after_data: { servedAt, tableNumber: order.table_number, number: order.number },
    });

    return NextResponse.json({ id, servedAt, duplicate: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar pedido servido." }, { status: 400 });
  }
}
