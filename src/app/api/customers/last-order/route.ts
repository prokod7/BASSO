import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

function variants(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
  return [...new Set([digits, local, `55${local}`])];
}

/**
 * PDV: dados do último pedido deste telefone (nome, endereço da última entrega e forma de
 * pagamento) para a pergunta "usar os dados salvos?". Só para a equipe logada.
 */
export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "waiter"], "orders.edit");
    const phone = (request.nextUrl.searchParams.get("phone") || "").replace(/\D/g, "");
    if (phone.length < 10) return NextResponse.json({ found: false });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db
      .from("orders")
      .select("id,number,daily_number,customer_name,customer_phone,channel,address,payment_method,created_at")
      .in("customer_phone", variants(phone))
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const last = data?.[0];
    if (!last) return NextResponse.json({ found: false });
    const withAddress = data!.find((order: any) => order.address && order.address.street);
    return NextResponse.json({
      found: true,
      name: last.customer_name || "",
      phone: last.customer_phone,
      paymentMethod: last.payment_method,
      lastOrderAt: last.created_at,
      lastOrderNumber: last.daily_number ?? last.number,
      address: withAddress?.address ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao buscar o último pedido." }, { status: 400 });
  }
}
