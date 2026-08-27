import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  city: z.string().min(2).max(100).optional(),
  districts: z.array(z.string().min(2).max(100)).min(1).optional(),
  fee: z.number().int().nonnegative().optional(),
  minimumOrder: z.number().int().nonnegative().optional(),
  maxDistanceKm: z.number().positive().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("delivery_zones").select("*").eq("id", id).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) payload.name = body.name.trim();
    if (body.city !== undefined) payload.city = body.city.trim();
    if (body.districts !== undefined) payload.districts = body.districts.map(value => value.trim());
    if (body.fee !== undefined) payload.fee_cents = body.fee;
    if (body.minimumOrder !== undefined) payload.minimum_order_cents = body.minimumOrder;
    if (body.maxDistanceKm !== undefined) payload.max_distance_km = body.maxDistanceKm;
    if (body.active !== undefined) payload.active = body.active;
    const { error } = await db.from("delivery_zones").update(payload).eq("id", id).is("deleted_at", null);
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: body.active === false ? "DELIVERY_ZONE_PAUSED" : body.active === true ? "DELIVERY_ZONE_REACTIVATED" : "DELIVERY_ZONE_UPDATED",
      entity_type: "delivery_zone",
      entity_id: id,
      before_data: before,
      after_data: payload,
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar zona." }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("delivery_zones").select("*").eq("id", id).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const now = new Date().toISOString();
    const { error } = await db.from("delivery_zones").update({ active: false, deleted_at: now, updated_at: now }).eq("id", id);
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "DELIVERY_ZONE_ARCHIVED",
      entity_type: "delivery_zone",
      entity_id: id,
      before_data: before,
      after_data: { active: false, deleted_at: now },
      reason: "Bairro/zona removido da operação sem apagar histórico de pedidos.",
    });
    return NextResponse.json({ archived: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao remover zona." }, { status: 400 });
  }
}
