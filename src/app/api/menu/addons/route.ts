import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { menuIdFromName } from "@/lib/menu-ids";

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome do adicional.").max(180),
  price: z.number().int().nonnegative(),
  maxQuantity: z.number().int().min(1).max(2).default(2),
  active: z.boolean().default(true),
});

/** Cria um novo adicional de pizza. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager","counter"], "menu.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = menuIdFromName(body.name);
    const row = { id, name: body.name, price_cents: body.price, max_quantity: body.maxQuantity, active: body.active };
    const { error } = await db.from("addons").insert(row);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "MENU_ADDON_CREATED", entity_type: "addon", entity_id: id, after_data: row });
    return NextResponse.json({ id, created: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : undefined;
    return NextResponse.json({ error: message || "Falha ao criar adicional." }, { status: 400 });
  }
}
