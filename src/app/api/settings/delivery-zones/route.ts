import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ name: z.string().min(2).max(100), districts: z.array(z.string().min(2).max(100)).min(1), fee: z.number().int().nonnegative(), minimumOrder: z.number().int().nonnegative(), maxDistanceKm: z.number().positive().nullable().optional(), active: z.boolean().default(true) });
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient(); if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const payload = { name: body.name, districts: body.districts.map(value => value.trim()), fee_cents: body.fee, minimum_order_cents: body.minimumOrder, max_distance_km: body.maxDistanceKm || null, active: body.active };
    const { data, error } = await db.from("delivery_zones").insert(payload).select("id").single(); if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "DELIVERY_ZONE_CREATED", entity_type: "delivery_zone", entity_id: data.id, after_data: payload });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Zona inválida." }, { status: 400 }); }
}
