import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "finance", "viewer"], "inventory.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const [inventoryResult, productsResult] = await Promise.all([
      db.from("inventory_items").select("id,product_id,unit,quantity,minimum_quantity,allow_negative,updated_at").order("updated_at", { ascending: false }),
      db.from("products").select("id,name,category,active").eq("stock_tracked", true),
    ]);
    if (inventoryResult.error) throw inventoryResult.error;
    if (productsResult.error) throw productsResult.error;
    const productMap = new Map((productsResult.data || []).map((row: any) => [row.id, row]));
    const items = (inventoryResult.data || []).map((row: any) => {
      const product = productMap.get(row.product_id) as any;
      return {
        id: row.id,
        productId: row.product_id,
        name: product?.name || row.product_id,
        category: product?.category || "unknown",
        active: product?.active !== false,
        unit: row.unit,
        quantity: Number(row.quantity),
        minQuantity: Number(row.minimum_quantity),
        allowNegative: Boolean(row.allow_negative),
        updatedAt: row.updated_at,
      };
    });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar estoque." }, { status: 400 });
  }
}
