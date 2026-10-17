import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "kitchen", "bar", "driver", "viewer"], "orders.view");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const [{ data: order, error: orderError }, { data: verification, error: verificationError }] = await Promise.all([
      db.from("orders").select("id,number,daily_number,channel,status,driver_id").eq("id", id).is("deleted_at", null).single(),
      db.from("delivery_verifications").select("pickup_token,pickup_code,pickup_verified_at,pickup_verified_driver_id,delivery_verified_at").eq("order_id", id).maybeSingle(),
    ]);
    if (orderError) throw orderError;
    if (verificationError) throw verificationError;
    if (order.channel !== "own_delivery") return NextResponse.json({ applicable: false });
    if (!verification) throw new Error("Validação de entrega não foi gerada para este pedido.");

    if (auth.role === "driver") {
      const { data: driver, error } = await db.from("drivers").select("id").eq("id", order.driver_id).eq("profile_id", auth.userId).maybeSingle();
      if (error) throw error;
      if (!driver) throw new Error("Motoboy só pode consultar o pedido atribuído ao próprio perfil.");
    }

    const pickupUrl = `${request.nextUrl.origin}/painel/motoboy?order=${encodeURIComponent(id)}&pickupToken=${encodeURIComponent(verification.pickup_token)}`;
    return NextResponse.json({
      applicable: true,
      orderId: id,
      number: Number(order.daily_number ?? order.number),
      status: order.status,
      pickupCode: verification.pickup_code,
      pickupToken: verification.pickup_token,
      pickupUrl,
      pickupVerifiedAt: verification.pickup_verified_at,
      pickupVerifiedDriverId: verification.pickup_verified_driver_id,
      deliveryVerifiedAt: verification.delivery_verified_at,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar validação da entrega." }, { status: 400 });
  }
}
