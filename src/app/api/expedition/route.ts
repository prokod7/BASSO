import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "kitchen", "bar", "waiter"], "orders.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: orders, error } = await db.from("orders").select("id,number,channel,status,payment_status,customer_name,customer_phone,address,total_cents,payment_method,change_for_cents,expedition_status,expedition_notes,created_at,updated_at").in("status", ["preparing", "ready"]).is("deleted_at", null).order("created_at");
    if (error) throw error;
    const ids = (orders || []).map((order: { id: string }) => order.id);
    const { data: items, error: itemsError } = ids.length ? await db.from("order_items").select("id,order_id,name_snapshot,quantity,sector,production_status,selection").in("order_id", ids).neq("production_status", "cancelled").order("created_at") : { data: [], error: null };
    if (itemsError) throw itemsError;
    const grouped = new Map<string, unknown[]>();
    for (const item of items || []) {
      const list = grouped.get(item.order_id) || [];
      list.push(item);
      grouped.set(item.order_id, list);
    }
    return NextResponse.json({ orders: (orders || []).map((order: { id: string }) => ({ ...order, items: grouped.get(order.id) || [] })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar expedição." }, { status: 400 });
  }
}
