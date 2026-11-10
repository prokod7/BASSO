import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePublicCheckout } from "@/lib/public-checkout";
import { quoteCommercialTerms } from "@/lib/server-quote";
import { requireOperationalRole } from "@/lib/authz";
import { createQuotedOrder, storeAcceptance } from "@/lib/checkout-order";

const PUBLIC_PAYMENT_METHODS = ["pix", "cash", "debit", "credit", "meal_voucher", "food_voucher"] as const;

export async function POST(request: NextRequest) {
  try {
    const key = request.headers.get("idempotency-key");
    if (!key) return NextResponse.json({ error: "Cabeçalho Idempotency-Key obrigatório." }, { status: 400 });
    const raw = await request.json();
    const hasReward = Array.isArray(raw?.items) && raw.items.some((item: any) => item?.kind === "reward");
    if (hasReward || raw?.rewardAuthorizationToken) throw new Error("Recompensas são lançadas exclusivamente pela operação interna.");
    const supplied = parsePublicCheckout(raw);
    if (!["own_delivery", "pickup", "table_qr"].includes(supplied.channel)) throw new Error("Canal não permitido no checkout público.");
    if (!(PUBLIC_PAYMENT_METHODS as readonly string[]).includes(supplied.paymentMethod)) throw new Error("Forma de pagamento disponível somente no PDV interno.");
    if (supplied.sourceIdempotencyKey !== key) return NextResponse.json({ error: "Chave de idempotência divergente." }, { status: 400 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado no servidor." }, { status: 503 });
    const { data: existing } = await db.from("idempotency_keys").select("response_body,status_code").eq("key", key).maybeSingle();
    if (existing) return NextResponse.json(existing.response_body, { status: existing.status_code || 200 });

    const store = await storeAcceptance(db);
    if (!store.accepting) {
      return NextResponse.json({ error: store.message, operationalStatus: store.status }, { status: 409 });
    }

    const quote = await quoteCommercialTerms({
      items: supplied.items,
      channel: supplied.channel,
      couponCode: supplied.couponCode,
      city: supplied.address?.city,
      district: supplied.address?.district,
    });
    if (supplied.channel === "own_delivery" && quote.coverageConfigurationPending) {
      return NextResponse.json({ error: "A entrega está temporariamente indisponível porque os bairros e taxas ainda não foram configurados. Escolha retirada ou fale com a pizzaria." }, { status: 409 });
    }
    if (supplied.paymentMethod === "cash" && supplied.changeFor != null && supplied.changeFor < quote.total) {
      throw new Error(`O valor para troco deve ser igual ou maior que R$ ${(quote.total / 100).toFixed(2).replace(".", ",")}.`);
    }
    const created = await createQuotedOrder(db, supplied, quote);
    const response = { id: created.id, number: created.number, status: created.status, tabId: created.tabId, quote, accessToken: created.accessToken };
    await db.from("idempotency_keys").insert({ key, scope: "orders:create", response_body: response, status_code: 201 });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pedido inválido." }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "finance", "viewer"], "orders.view");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const requested = Number.parseInt(request.nextUrl.searchParams.get("limit") || "30", 10);
  const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, requested)) : 30;
  const { data, error } = await db.from("orders").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}
