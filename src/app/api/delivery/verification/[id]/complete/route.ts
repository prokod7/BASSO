import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  driverId: z.string().uuid(),
  code: z.string().trim().min(4).max(12),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "driver"], "delivery.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    if (auth.role === "driver") {
      const { data: owned, error } = await db.from("drivers").select("id").eq("id", body.driverId).eq("profile_id", auth.userId).eq("active", true).maybeSingle();
      if (error) throw error;
      if (!owned) throw new Error("Motoboy só pode confirmar a própria entrega.");
    }

    const { data, error } = await db.rpc("confirm_delivery_with_code", {
      p_order_id: id,
      p_driver_id: body.driverId,
      p_code: body.code,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao confirmar entrega." }, { status: 400 });
  }
}
