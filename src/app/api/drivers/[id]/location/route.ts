import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperationalRole } from "@/lib/authz";

const schema = z.object({
  orderId: z.string().min(1).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().nullable().optional(),
  speed: z.number().nonnegative().nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  capturedAt: z.string().datetime().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["driver", "manager", "counter"], "delivery.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    if (auth.role === "driver") {
      const { data: driver } = await db.from("drivers").select("profile_id").eq("id", id).single();
      if (!driver || driver.profile_id !== auth.userId) return NextResponse.json({ error: "Motoboy não autorizado." }, { status: 403 });
    }
    const { error } = await db.rpc("record_driver_location_v2", {
      p_driver_id: id,
      p_order_id: body.orderId || null,
      p_latitude: body.latitude,
      p_longitude: body.longitude,
      p_accuracy: body.accuracy ?? null,
      p_speed: body.speed ?? null,
      p_heading: body.heading ?? null,
      p_captured_at: body.capturedAt || new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, internalTracking: true, customerTracking: Boolean(body.orderId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Localização inválida." }, { status: 400 });
  }
}
