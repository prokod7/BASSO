import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  driverId: z.string().uuid(),
  code: z.string().max(20).optional(),
  token: z.string().max(120).optional(),
}).refine(value => Boolean(value.code?.trim() || value.token?.trim()), { message: "Informe o QR ou código de retirada." });

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
      if (!owned) throw new Error("Motoboy só pode validar retirada no próprio perfil.");
    }

    const { data, error } = await db.rpc("verify_delivery_pickup", {
      p_order_id: id,
      p_driver_id: body.driverId,
      p_code: body.code || null,
      p_token: body.token || null,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao validar retirada." }, { status: 400 });
  }
}
