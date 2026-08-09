import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { IfoodAdapter } from "@/lib/integrations/ifood";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOperationalRole(["manager", "counter"], "orders.edit");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: order, error } = await db.from("orders")
      .select("channel,external_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) throw error;
    if (order.channel !== "ifood" || !order.external_id) throw new Error("Este pedido não pertence ao iFood.");
    const reasons = await new IfoodAdapter().cancellationReasons(order.external_id);
    if (!reasons.length) throw new Error("O iFood não disponibilizou motivos de cancelamento para este pedido.");
    return NextResponse.json({ reasons }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar motivos do iFood." }, { status: 400 });
  }
}
