import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseIncomingOrder } from "@/lib/server-orders";
import { quoteCommercialTerms } from "@/lib/server-quote";
import { requireOperationalRole } from "@/lib/authz";
import { createHash, randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const key = request.headers.get("idempotency-key");
    if (!key) return NextResponse.json({ error: "Cabeçalho Idempotency-Key obrigatório." }, { status: 400 });
    const raw = await request.json();
    const hasReward = Array.isArray(raw?.items) && raw.items.some((item: any) => item?.kind === "reward");
    if (hasReward || raw?.rewardAuthorizationToken) throw new Error("Recompensas são lançadas exclusivamente pela operação interna.");
    const supplied = parseIncomingOrder(raw);
    if (!["own_delivery", "pickup", "table_qr"].includes(supplied.channel)) throw new Error("Canal não permitido no checkout público.");
    if (supplied.sourceIdempotencyKey !== key) return NextResponse.json({ error: "Chave de idempotência divergente." }, { status: 400 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado no servidor." }, { status: 503 });
    const { data: existing } = await db.from("idempotency_keys").select("response_body,status_code").eq("key", key).maybeSingle();
    if (existing) return NextResponse.json(existing.response_body, { status: existing.status_code || 200 });
    const { data: runtime, error: runtimeError } = await db.from("store_runtime_status").select("operational_status,accepting_orders,pause_reason").eq("id", true).maybeSingle();
    if (runtimeError) throw runtimeError;
    if (runtime && !runtime.accepting_orders) {
      const detail = runtime.operational_status === "paused" ? (runtime.pause_reason || "Pedidos temporariamente pausados.") : "A loja está fechada no momento.";
      return NextResponse.json({ error: detail, operationalStatus: runtime.operational_status }, { status: 409 });
    }
    const quote = await quoteCommercialTerms({ items: supplied.items, channel: supplied.channel, couponCode: supplied.couponCode, district: supplied.address?.district });
    const order = parseIncomingOrder({ ...supplied, items: quote.items, subtotal: quote.subtotal, discount: quote.discount, deliveryFee: quote.deliveryFee, total: quote.total, couponCode: quote.couponCode });
    const { error } = await db.rpc("create_order_transaction", { p_order: order });
    if (error) throw error;
    const accessToken = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(accessToken).digest("hex");
    await db.from("order_access_tokens").insert({ order_id: order.id, token_hash: tokenHash });
    await db.rpc("enqueue_order_print_jobs", { p_order_id: order.id });
    const { data: created, error: createdError } = await db.from("orders").select("number,status,tab_id").eq("id", order.id).single();
    if (createdError) throw createdError;
    const response = { id: order.id, number: Number(created.number), status: created.status, tabId: created.tab_id || undefined, quote, accessToken };
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
  const limit = Math.min(100, Number(request.nextUrl.searchParams.get("limit") || 30));
  const { data, error } = await db.from("orders").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}
