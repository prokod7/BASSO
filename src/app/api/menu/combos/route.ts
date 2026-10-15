import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { comboConfigSchema } from "@/lib/combos";
import { apiErrorMessage } from "@/lib/api-error";

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const schema = comboConfigSchema
  .extend({
    id: z.string().min(1).max(120).optional(),
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().min(2).max(1000),
    price: z.number().int().nonnegative(),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: z.string().regex(hhmm).optional(),
    end: z.string().regex(hhmm).optional(),
    channels: z
      .array(
        z.enum(["own_delivery", "pickup", "counter", "dine_in", "table_qr"]),
      )
      .min(1)
      .default(["own_delivery", "pickup", "counter", "dine_in", "table_qr"]),
    active: z.boolean().default(true),
  })
  .refine((v) => Boolean(v.start) === Boolean(v.end), {
    message: "Preencha início e fim do horário.",
  });

async function save(request: NextRequest, updating: boolean) {
  try {
    const auth = await requireOperationalRole(
      ["manager", "counter"],
      "menu.manage",
    );
    const body = schema.parse(await request.json());
    if (updating && !body.id) throw new Error("Informe o combo a editar.");
    const db = createAdminClient();
    if (!db)
      return NextResponse.json(
        { error: "Supabase não configurado." },
        { status: 503 },
      );
    const sweets = body.sweetFlavors || [body.sweetFlavor];
    const ids = [...new Set([...body.grandeFlavors, ...sweets])];
    const [f, b] = await Promise.all([
      db.from("pizza_flavors").select("id,category").in("id", ids),
      db
        .from("products")
        .select("id,category")
        .in("id", body.beverages)
        .is("deleted_at", null),
    ]);
    if (f.error) throw f.error;
    if (b.error) throw b.error;
    if (
      body.grandeFlavors.some(
        (id) =>
          !f.data?.some((row) => row.id === id && row.category !== "sweet"),
      ) ||
      sweets.some(
        (id) =>
          !f.data?.some((row) => row.id === id && row.category === "sweet"),
      )
    )
      throw new Error("Confira os sabores salgados e doces selecionados.");
    if (
      body.beverages.some(
        (id) =>
          !b.data?.some((row) => row.id === id && row.category === "beverages"),
      )
    )
      throw new Error("Confira as bebidas selecionadas.");
    const id = updating ? body.id! : `combo-${randomUUID()}`;
    const config = comboConfigSchema.parse({ ...body, sweetFlavor: sweets[0] });
    const values = {
      name: body.name,
      description: body.description,
      price_cents: body.price,
      active: body.active,
      available_channels: body.channels,
      available_schedule: {
        days: [...new Set(body.days)],
        ...(body.start ? { start: body.start, end: body.end } : {}),
      },
      config,
      updated_at: new Date().toISOString(),
    };
    const result = updating
      ? await db
          .from("products")
          .update(values)
          .eq("id", id)
          .eq("category", "combo")
          .is("deleted_at", null)
          .select("id")
          .single()
      : await db
          .from("products")
          .insert({ id, category: "combo", stock_tracked: false, ...values })
          .select("id")
          .single();
    if (result.error) throw result.error;
    await db
      .from("audit_logs")
      .insert({
        actor_id: auth.userId === "demo" ? null : auth.userId,
        actor_label: auth.displayName,
        action: updating ? "COMBO_UPDATED" : "COMBO_CREATED",
        entity_type: "product",
        entity_id: id,
        after_data: values,
      });
    return NextResponse.json(
      { id, saved: true },
      { status: updating ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: apiErrorMessage(error, "Falha ao salvar combo.") },
      { status: 400 },
    );
  }
}
export function POST(request: NextRequest) {
  return save(request, false);
}
export function PATCH(request: NextRequest) {
  return save(request, true);
}
