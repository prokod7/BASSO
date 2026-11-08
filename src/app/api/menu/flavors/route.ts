import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { menuIdFromName } from "@/lib/menu-ids";

const channel = z.enum(["own_delivery","pickup","counter","dine_in","ifood","99food","table_qr"]);
const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome do sabor.").max(180),
  category: z.enum(["traditional","premium","sweet"]),
  priceGrande: z.number().int().positive("Informe o preço da Grande."),
  priceBroto: z.number().int().positive("Informe o preço da Broto."),
  description: z.string().trim().max(1000).default(""),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  channels: z.array(channel).min(1).optional(),
});

/** Cria um novo sabor de pizza. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager","counter"], "menu.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = menuIdFromName(body.name);
    const row: Record<string, unknown> = {
      id, name: body.name, category: body.category,
      price_grande_cents: body.priceGrande, price_broto_cents: body.priceBroto,
      description: body.description || body.ingredients.join(", "),
      ingredients: body.ingredients, featured: body.featured, active: body.active,
    };
    if (body.channels) row.available_channels = body.channels;
    const { error } = await db.from("pizza_flavors").insert(row);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "MENU_FLAVOR_CREATED", entity_type: "flavor", entity_id: id, after_data: row });
    return NextResponse.json({ id, created: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : undefined;
    return NextResponse.json({ error: message || "Falha ao criar sabor." }, { status: 400 });
  }
}
