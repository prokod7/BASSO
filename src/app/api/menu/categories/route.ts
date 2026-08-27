import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["pizza", "beverage", "dessert", "combo", "general"]).default("general"),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "categoria";
}

async function uniqueId(db: NonNullable<ReturnType<typeof createAdminClient>>, name: string) {
  const base = slugify(name);
  let candidate = base;
  for (let index = 2; index < 100; index += 1) {
    const { data } = await db.from("categories").select("id").eq("id", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${index}`;
  }
  throw new Error("Não foi possível gerar um identificador único para a categoria.");
}

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter"], "menu.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db
      .from("categories")
      .select("id,name,kind,sort_order,active,image_url,created_at,updated_at")
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return NextResponse.json({
      categories: (data || []).map(row => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        sortOrder: Number(row.sort_order || 0),
        active: Boolean(row.active),
        image: row.image_url || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar categorias." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const body = categorySchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const id = await uniqueId(db, body.name);
    const payload = {
      id,
      name: body.name,
      kind: body.kind,
      sort_order: body.sortOrder,
      active: body.active,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("categories").insert(payload);
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "MENU_CATEGORY_CREATED",
      entity_type: "category",
      entity_id: id,
      after_data: payload,
    });
    return NextResponse.json({ id, ...body }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Categoria inválida." }, { status: 400 });
  }
}
