import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  kind: z.enum(["pizza", "beverage", "dessert", "combo", "general"]).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("categories").select("*").eq("id", id).is("deleted_at", null).single();
    if (beforeError) throw beforeError;

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) payload.name = body.name;
    if (body.kind !== undefined) payload.kind = body.kind;
    if (body.sortOrder !== undefined) payload.sort_order = body.sortOrder;
    if (body.active !== undefined) payload.active = body.active;
    if (body.imageUrl !== undefined) payload.image_url = body.imageUrl;

    const { error } = await db.from("categories").update(payload).eq("id", id).is("deleted_at", null);
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "MENU_CATEGORY_UPDATED",
      entity_type: "category",
      entity_id: id,
      before_data: before,
      after_data: payload,
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar categoria." }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("categories").select("*").eq("id", id).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const now = new Date().toISOString();

    const { error: categoryError } = await db.from("categories").update({ active: false, deleted_at: now, updated_at: now }).eq("id", id);
    if (categoryError) throw categoryError;
    await db.from("products").update({ active: false, updated_at: now }).eq("category", id).is("deleted_at", null);
    if (before.kind === "pizza") await db.from("pizza_flavors").update({ active: false, updated_at: now }).eq("category", id);

    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "MENU_CATEGORY_ARCHIVED",
      entity_type: "category",
      entity_id: id,
      before_data: before,
      after_data: { active: false, deleted_at: now },
      reason: "Categoria removida do catálogo sem apagar histórico de pedidos.",
    });
    return NextResponse.json({ archived: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao remover categoria." }, { status: 400 });
  }
}
