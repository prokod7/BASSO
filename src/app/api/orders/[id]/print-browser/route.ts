import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  type: z.enum(["entrega", "cozinha"]),
  source: z.enum(["order_detail", "kds", "print_page"]).default("order_detail"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance"], "orders.view");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const { data: order, error } = await db.from("orders").select("id,number").eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "ORDER_BROWSER_PRINT_OPENED",
      entity_type: "order",
      entity_id: id,
      origin: "web",
      after_data: { orderNumber: Number(order.number), template: body.type, source: body.source },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar impressão." }, { status: 400 });
  }
}
