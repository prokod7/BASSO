import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const channel = z.enum(["own_delivery", "pickup", "counter", "dine_in", "ifood", "99food", "table_qr"]);
const schema = z.object({
  name: z.string().trim().min(2).max(180),
  category: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(""),
  variant: z.string().max(160).nullable().optional(),
  price: z.number().int().nonnegative(),
  stockTracked: z.boolean().default(false),
  active: z.boolean().default(true),
  channels: z.array(channel).min(1).default(["own_delivery", "pickup", "counter", "dine_in", "table_qr"]),
  schedule: z.record(z.any()).default({}),
  allergens: z.array(z.string().min(1).max(120)).max(30).default([]),
  imageUrl: z.string().max(1000).nullable().optional(),
});

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "produto";
}

async function uniqueId(db: NonNullable<ReturnType<typeof createAdminClient>>, name: string) {
  const base = slugify(name);
  let candidate = base;
  for (let index = 2; index < 100; index += 1) {
    const { data } = await db.from("products").select("id").eq("id", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${index}`;
  }
  throw new Error("Não foi possível gerar um identificador único para o produto.");
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const { data: category, error: categoryError } = await db.from("categories").select("id,active").eq("id", body.category).is("deleted_at", null).single();
    if (categoryError || !category) throw new Error("Categoria não encontrada.");
    const id = await uniqueId(db, body.name);
    const payload = {
      id,
      name: body.name,
      category: body.category,
      description: body.description,
      variant: body.variant || null,
      price_cents: body.price,
      image_url: body.imageUrl || null,
      stock_tracked: body.stockTracked,
      active: body.active,
      available_channels: body.channels,
      available_schedule: body.schedule,
      allergens: body.allergens,
      config: {},
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("products").insert(payload);
    if (error) throw error;

    if (body.stockTracked) {
      const { error: inventoryError } = await db.from("inventory_items").insert({ product_id: id, unit: "unidade", quantity: 0, minimum_quantity: 0, allow_negative: false });
      if (inventoryError) {
        await db.from("products").delete().eq("id", id);
        throw inventoryError;
      }
    }

    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "MENU_PRODUCT_CREATED",
      entity_type: "product",
      entity_id: id,
      after_data: payload,
    });
    return NextResponse.json({ id, ...body }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Produto inválido." }, { status: 400 });
  }
}
