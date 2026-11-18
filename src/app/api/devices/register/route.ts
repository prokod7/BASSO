import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  deviceKey: z.string().min(12).max(200),
  deviceType: z.enum(["desktop", "tablet", "waiter_smartpos", "driver_phone", "kds", "other"]),
  label: z.string().min(2).max(120),
  provider: z.string().max(80).optional(),
  serial: z.string().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "driver", "kitchen", "bar"], "orders.view");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("registered_devices").upsert({
      device_key: body.deviceKey,
      device_type: body.deviceType,
      label: body.label,
      provider: body.provider || null,
      serial: body.serial || null,
      assigned_profile_id: auth.userId === "demo" ? null : auth.userId,
      active: true,
      last_seen_at: new Date().toISOString(),
      metadata: body.metadata || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "device_key" }).select("id,device_key,device_type,label,provider,serial,last_seen_at").single();
    if (error) throw error;
    return NextResponse.json({ device: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar dispositivo." }, { status: 400 });
  }
}
