import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperationalRole } from "@/lib/authz";

const schema = z.object({ driverId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["driver", "manager", "counter"], "delivery.manage");
    const { driverId } = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    if (auth.role === "driver") {
      const { data: driver } = await db.from("drivers").select("profile_id").eq("id", driverId).single();
      if (!driver || driver.profile_id !== auth.userId) return NextResponse.json({ error: "Motoboy não autorizado para este turno." }, { status: 403 });
    }
    const { data, error } = await db.rpc("end_driver_shift", { p_driver_id: driverId, p_actor_id: auth.userId === "demo" ? null : auth.userId });
    if (error) throw error;
    return NextResponse.json({ active: false, ended: Boolean(data), endedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao encerrar turno." }, { status: 400 });
  }
}
