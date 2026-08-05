import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settle"), paymentMethod: z.enum(["pix", "cash", "debit", "credit", "meal_voucher", "food_voucher"]) }),
  z.object({ action: z.literal("cancel"), reason: z.string().min(2).max(500) }),
  z.object({ action: z.literal("restore") })
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "finance"]);
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const actorId = auth.userId === "demo" ? null : auth.userId;
    if (body.action === "settle") {
      const { error } = await db.rpc("settle_financial_entry", { p_entry_id: id, p_payment_method: body.paymentMethod, p_actor_id: actorId });
      if (error) throw error;
      return NextResponse.json({ id, status: "settled" });
    }
    const { data: before, error: beforeError } = await db.from("financial_entries").select("*").eq("id", id).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const status = body.action === "cancel" ? "cancelled" : "pending";
    const { error } = await db.from("financial_entries").update({ status, settled_at: null, settled_by: null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: actorId, actor_label: auth.displayName, action: body.action === "cancel" ? "FINANCIAL_ENTRY_CANCELLED" : "FINANCIAL_ENTRY_RESTORED", entity_type: "financial_entry", entity_id: id, reason: body.action === "cancel" ? body.reason : null, before_data: before, after_data: { status } });
    return NextResponse.json({ id, status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao alterar lançamento." }, { status: 400 });
  }
}
