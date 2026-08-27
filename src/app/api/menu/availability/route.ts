import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRuntimeMenu } from "@/lib/server-menu-pricing";

const channel = z.enum(["own_delivery","pickup","counter","dine_in","ifood","99food","table_qr"]);
const schema = z.object({
  entity: z.enum(["flavor","product","addon"]),
  id: z.string().min(1).max(120),
  active: z.boolean(),
  priceGrande: z.number().int().nonnegative().optional(),
  priceBroto: z.number().int().nonnegative().optional(),
  price: z.number().int().nonnegative().optional(),
  channels: z.array(channel).min(1).optional(),
  schedule: z.record(z.any()).optional(),
  name: z.string().trim().min(2).max(180).optional(),
  description: z.string().max(1000).optional(),
  ingredients: z.array(z.string().min(1).max(120)).max(40).optional(),
  featured: z.boolean().optional(),
  allergens: z.array(z.string().min(1).max(120)).max(30).optional(),
  variant: z.string().max(160).nullable().optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
  maxQuantity: z.number().int().min(1).max(2).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  stockTracked: z.boolean().optional(),
});

export async function GET() {
  try {
    await requireOperationalRole(["manager","counter"], "menu.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const menu = await loadRuntimeMenu(db);
    return NextResponse.json(menu, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar cardápio." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager","counter"], "menu.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    if (body.entity === "product" && body.category !== undefined) {
      const { data: category, error: categoryError } = await db.from("categories").select("id").eq("id", body.category).is("deleted_at", null).single();
      if (categoryError || !category) throw new Error("Categoria selecionada não existe mais.");
    }

    const { error } = await db.rpc("update_menu_item", {
      p_entity: body.entity,
      p_id: body.id,
      p_active: body.active,
      p_price_grande: body.priceGrande ?? null,
      p_price_broto: body.priceBroto ?? null,
      p_price: body.price ?? null,
      p_channels: body.channels ?? null,
      p_schedule: body.schedule ?? null,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;

    const extra: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) extra.name = body.name;
    if (body.description !== undefined) extra.description = body.description;
    if (body.allergens !== undefined) extra.allergens = body.allergens;
    if (body.entity === "flavor") {
      if (body.ingredients !== undefined) extra.ingredients = body.ingredients;
      if (body.featured !== undefined) extra.featured = body.featured;
    }
    if (body.entity === "product") {
      if (body.variant !== undefined) extra.variant = body.variant;
      if (body.imageUrl !== undefined) extra.image_url = body.imageUrl;
      if (body.category !== undefined) extra.category = body.category;
      if (body.stockTracked !== undefined) extra.stock_tracked = body.stockTracked;
    }
    if (body.entity === "addon" && body.maxQuantity !== undefined) extra.max_quantity = body.maxQuantity;

    if (Object.keys(extra).length > 1) {
      const table = body.entity === "flavor" ? "pizza_flavors" : body.entity === "product" ? "products" : "addons";
      let update = db.from(table).update(extra).eq("id", body.id);
      if (body.entity === "product") update = update.is("deleted_at", null);
      const { error: extraError } = await update;
      if (extraError) throw extraError;

      if (body.entity === "product" && body.stockTracked !== undefined) {
        const { data: inventory } = await db.from("inventory_items").select("id").eq("product_id", body.id).maybeSingle();
        if (body.stockTracked && !inventory) {
          const { error: inventoryError } = await db.from("inventory_items").insert({ product_id: body.id, unit: "unidade", quantity: 0, minimum_quantity: 0, allow_negative: false });
          if (inventoryError) throw inventoryError;
        }
      }

      await db.from("audit_logs").insert({
        actor_id: auth.userId === "demo" ? null : auth.userId,
        actor_label: auth.displayName,
        action: "MENU_CONTENT_UPDATED",
        entity_type: body.entity,
        entity_id: body.id,
        after_data: extra,
      });
    }
    return NextResponse.json({ saved: true, ...body });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar cardápio." }, { status: 400 });
  }
}
