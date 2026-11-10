import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ sector: z.enum(["kitchen", "bar", "counter", "all"]).default("all"), reason: z.string().min(2).max(300) });

/**
 * Imprimir/reimprimir: sempre cria trabalho novo na fila (a estação de impressão do
 * atalho pega e imprime). Antes, depois da 1ª impressão nada novo entrava na fila.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "kitchen", "bar", "waiter"], "kds.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const [orderR, itemsR] = await Promise.all([
      db.from("orders").select("*").eq("id", id).is("deleted_at", null).single(),
      db.from("order_items").select("*").eq("order_id", id).neq("production_status", "cancelled").order("created_at"),
    ]);
    if (orderR.error) throw new Error("Pedido não encontrado.");
    if (itemsR.error) throw itemsR.error;
    const items = itemsR.data || [];
    // Cozinha recebe só os itens de produção; a via de entrega/balcão leva o pedido inteiro.
    const sectors = body.sector === "all" ? ["kitchen", "counter"] : [body.sector];
    const rows = sectors.map((sector) => {
      const own = sector === "counter" ? items : items.filter((item: any) => (item.sector || "kitchen") === sector);
      return own.length ? { order_id: id, sector, printer_key: sector === "kitchen" ? "cozinha" : sector, payload: { order: orderR.data, items: own }, status: "queued", is_reprint: true, created_by: auth.userId === "demo" ? null : auth.userId } : null;
    }).filter((row): row is NonNullable<typeof row> => row !== null);
    if (!rows.length) throw new Error("Pedido sem itens para imprimir.");
    const { error } = await db.from("print_jobs").insert(rows);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "ORDER_REPRINT_REQUESTED", entity_type: "order", entity_id: id, reason: body.reason, after_data: { sector: body.sector } });
    return NextResponse.json({ queued: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao solicitar impressão." }, { status: 400 });
  }
}
