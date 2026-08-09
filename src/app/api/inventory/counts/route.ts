import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({ countId: z.string().uuid(), itemId: z.string().uuid(), countedQuantity: z.number().nonnegative(), note: z.string().max(500).optional() });
const completeSchema = z.object({ countId: z.string().uuid(), reason: z.string().trim().min(2).max(500).default("Inventário físico") });

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "finance", "viewer"], "inventory.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const requested = request.nextUrl.searchParams.get("id");
    let countId = requested;
    if (!countId) {
      const { data } = await db.from("inventory_counts").select("id").eq("status", "open").order("started_at", { ascending: false }).limit(1).maybeSingle();
      countId = data?.id || null;
    }
    if (!countId) return NextResponse.json({ count: null });
    const [countR, itemsR] = await Promise.all([
      db.from("inventory_counts").select("*").eq("id", countId).single(),
      db.from("inventory_count_items").select("id,count_id,inventory_item_id,system_quantity,counted_quantity,difference,note,inventory_items(product_id,unit,products(name))").eq("count_id", countId).order("id"),
    ]);
    if (countR.error) throw countR.error;
    if (itemsR.error) throw itemsR.error;
    const items = (itemsR.data || []).map((row: any) => {
      const inv = Array.isArray(row.inventory_items) ? row.inventory_items[0] : row.inventory_items;
      const product = inv && typeof inv === "object" && "products" in inv ? (Array.isArray(inv.products) ? inv.products[0] : inv.products) : null;
      return {
        id: row.id,
        inventoryItemId: row.inventory_item_id,
        productId: inv && typeof inv === "object" && "product_id" in inv ? String(inv.product_id) : "",
        name: product && typeof product === "object" && "name" in product ? String(product.name) : "Produto",
        systemQuantity: Number(row.system_quantity),
        countedQuantity: row.counted_quantity === null ? undefined : Number(row.counted_quantity),
        difference: Number(row.difference || 0),
        unit: inv && typeof inv === "object" && "unit" in inv ? String(inv.unit) : "unidade",
        note: row.note || undefined,
      };
    });
    return NextResponse.json({ count: { id: countR.data.id, status: countR.data.status, startedAt: countR.data.started_at, completedAt: countR.data.completed_at || undefined, items } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar inventário." }, { status: 400 });
  }
}

export async function POST() {
  try {
    const auth = await requireOperationalRole(["manager", "counter"], "inventory.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: existing } = await db.from("inventory_counts").select("id").eq("status", "open").limit(1).maybeSingle();
    if (existing?.id) return NextResponse.json({ id: existing.id, reused: true });
    const { data, error } = await db.rpc("start_inventory_count", { p_actor_id: auth.userId === "demo" ? null : auth.userId });
    if (error) throw error;
    return NextResponse.json({ id: data, reused: false }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao iniciar inventário." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter"], "inventory.manage");
    const body = patchSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { error } = await db.from("inventory_count_items").update({ counted_quantity: body.countedQuantity, note: body.note || null }).eq("id", body.itemId).eq("count_id", body.countId);
    if (error) throw error;
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao salvar contagem." }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "inventory.manage");
    const body = completeSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.rpc("complete_inventory_count", { p_count_id: body.countId, p_actor_id: auth.userId === "demo" ? null : auth.userId, p_reason: body.reason });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao concluir inventário." }, { status: 400 });
  }
}
