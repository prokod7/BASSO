import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("products").select("*").eq("id", id).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const now = new Date().toISOString();
    const { error } = await db.from("products").update({ active: false, deleted_at: now, updated_at: now }).eq("id", id);
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "MENU_PRODUCT_ARCHIVED",
      entity_type: "product",
      entity_id: id,
      before_data: before,
      after_data: { active: false, deleted_at: now },
      reason: "Produto removido do catálogo sem apagar histórico de pedidos.",
    });
    return NextResponse.json({ archived: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao remover produto." }, { status: 400 });
  }
}
