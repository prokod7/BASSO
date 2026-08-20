import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const schema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().min(2).max(1000),
  price: z.number().int().nonnegative(),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start: z.string().regex(hhmm).optional(),
  end: z.string().regex(hhmm).optional(),
  grandeFlavors: z.array(z.string().min(1).max(120)).min(1),
  beverages: z.array(z.string().min(1).max(120)).min(1),
  sweetFlavor: z.string().min(1).max(120).default("brigadeiro"),
  active: z.boolean().default(true),
});

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "combo";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter"], "menu.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const [{ data: flavorRows, error: flavorError }, { data: beverageRows, error: beverageError }] = await Promise.all([
      db.from("pizza_flavors").select("id,active").in("id", body.grandeFlavors),
      db.from("products").select("id,active,category").in("id", body.beverages),
    ]);
    if (flavorError) throw flavorError;
    if (beverageError) throw beverageError;

    const validFlavors = new Set((flavorRows || []).filter((row: any) => row.active).map((row: any) => row.id));
    const validBeverages = new Set((beverageRows || []).filter((row: any) => row.active && row.category === "beverages").map((row: any) => row.id));
    if (body.grandeFlavors.some(id => !validFlavors.has(id))) throw new Error("Existe sabor inválido ou indisponível na configuração do combo.");
    if (body.beverages.some(id => !validBeverages.has(id))) throw new Error("Existe bebida inválida ou indisponível na configuração do combo.");

    const { data: sweet } = await db.from("pizza_flavors").select("id,active").eq("id", body.sweetFlavor).maybeSingle();
    if (!sweet?.active) throw new Error("O sabor doce do combo não está disponível.");

    const id = `${slug(body.name)}-${randomUUID().slice(0, 8)}`;
    const schedule: Record<string, unknown> = { days: [...new Set(body.days)].sort((a, b) => a - b) };
    if (body.start && body.end) {
      schedule.start = body.start;
      schedule.end = body.end;
    }
    const config = {
      grandeFlavors: body.grandeFlavors,
      beverages: body.beverages,
      sweetFlavor: body.sweetFlavor,
      masses: ["traditional", "integral"],
      allowHalfHalf: true,
      allowAddonPlacement: true,
      structure: "grande_broto_bebida",
    };

    const { data: combo, error } = await db.from("products").insert({
      id,
      name: body.name,
      category: "combo",
      description: body.description,
      price_cents: body.price,
      stock_tracked: false,
      active: body.active,
      available_channels: ["own_delivery", "pickup", "counter", "dine_in", "table_qr"],
      available_schedule: schedule,
      config,
    }).select("id,name,description,price_cents,active,available_schedule,config").single();
    if (error) throw error;

    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "COMBO_CREATED",
      entity_type: "product",
      entity_id: id,
      after_data: combo,
    });

    return NextResponse.json({ combo }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar combo." }, { status: 400 });
  }
}
