import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  driverId: z.string().uuid(),
  code: z.string().trim().min(4).max(12),
  paymentReceived: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "driver"], "delivery.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    if (auth.role === "driver") {
      const { data: owned, error } = await db.from("drivers").select("id").eq("id", body.driverId).eq("profile_id", auth.userId).eq("active", true).maybeSingle();
      if (error) throw error;
      if (!owned) throw new Error("Motoboy só pode confirmar a própria entrega.");
    }

    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id,driver_id,status,payment_status,payment_method,total_cents")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (orderError) throw orderError;
    if (order.driver_id !== body.driverId) throw new Error("Este pedido não está atribuído a este motoboy.");
    if (order.status !== "out_for_delivery") throw new Error("Pedido não está em rota.");

    if (order.payment_status !== "paid" && body.paymentReceived) {
      const { data: paidRows, error: paidError } = await db.from("payments").select("amount_cents").eq("order_id", id).eq("status", "paid");
      if (paidError) throw paidError;
      const paid = (paidRows || []).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
      const remaining = Math.max(0, Number(order.total_cents || 0) - paid);
      if (remaining > 0) {
        const { error: paymentError } = await db.rpc("record_order_payment_transaction", {
          p_order_id: id,
          p_method: order.payment_method,
          p_amount: remaining,
          p_idempotency_key: `driver_delivery:${id}`,
          p_actor_id: auth.userId === "demo" ? null : auth.userId,
          p_metadata: { source: "driver_delivery_confirmation", driverId: body.driverId, note: "Recebimento confirmado pelo motoboy na entrega" },
        });
        if (paymentError) throw paymentError;
      }
    }

    const { data, error } = await db.rpc("confirm_delivery_with_code", {
      p_order_id: id,
      p_driver_id: body.driverId,
      p_code: body.code,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao confirmar entrega." }, { status: 400 });
  }
}
