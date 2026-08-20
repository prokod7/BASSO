import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter"], "orders.edit");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const { data, error } = await db.rpc("mark_order_served", {
      p_order_id: id,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;

    return NextResponse.json({ id, servedAt: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar pedido servido." }, { status: 400 });
  }
}
