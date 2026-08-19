import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const channelSchema = z.enum(["own_delivery","pickup","counter","dine_in","ifood","99food","table_qr"]);
const schema = z.object({
  active: z.boolean().optional(),
  type: z.enum(["percentage","fixed"]).optional(),
  value: z.number().int().positive().optional(),
  totalLimit: z.number().int().positive().nullable().optional(),
  minimum: z.number().int().nonnegative().nullable().optional(),
  channels: z.array(channelSchema).min(1).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Nenhuma alteração informada.");

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager","counter"], "menu.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: readError } = await db.from("coupons").select("*").eq("id", id).single();
    if (readError) throw readError;
    const type = body.type ?? before.discount_type;
    const value = body.value ?? before.value;
    if (type === "percentage" && value > 100) throw new Error("Percentual máximo é 100%.");
    const startsAt = body.startsAt === undefined ? before.starts_at : body.startsAt;
    const endsAt = body.endsAt === undefined ? before.ends_at : body.endsAt;
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("O término deve ser posterior ao início.");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.active !== undefined) patch.active = body.active;
    if (body.type !== undefined) patch.discount_type = body.type;
    if (body.value !== undefined) patch.value = body.value;
    if (body.totalLimit !== undefined) patch.total_limit = body.totalLimit;
    if (body.minimum !== undefined) patch.minimum_cents = body.minimum;
    if (body.channels !== undefined) patch.channels = body.channels;
    if (body.startsAt !== undefined) patch.starts_at = body.startsAt;
    if (body.endsAt !== undefined) patch.ends_at = body.endsAt;
    if (typeof patch.total_limit === "number" && before.uses > patch.total_limit) throw new Error("O limite não pode ser menor que os usos já registrados.");
    const { error } = await db.from("coupons").update(patch).eq("id", id);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "COUPON_UPDATED", entity_type: "coupon", entity_id: id, before_data: before, after_data: patch });
    return NextResponse.json({ id, saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao alterar cupom." }, { status: 400 });
  }
}
