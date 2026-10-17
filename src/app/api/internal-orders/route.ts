import { apiErrorMessage } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseIncomingOrder } from "@/lib/server-orders";
import { quoteCommercialTerms } from "@/lib/server-quote";

const metadataSchema = z.object({ discountReason: z.string().max(500).optional(), rewardAuthorizationToken: z.string().optional() });

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter"], "orders.edit");
    const key = request.headers.get("idempotency-key");
    if (!key) throw new Error("Cabeçalho Idempotency-Key obrigatório.");
    const raw = await request.json();
    const metadata = metadataSchema.parse(raw);
    const hasReward = Array.isArray(raw?.items) && raw.items.some((item: any) => item?.kind === "reward");
    if (hasReward && !metadata.rewardAuthorizationToken) throw new Error("Autorização interna da recompensa obrigatória.");
    if (raw.sourceIdempotencyKey !== key) throw new Error("Chave de idempotência divergente.");
    if (raw.discount > 0 && !metadata.discountReason?.trim()) throw new Error("Motivo obrigatório para desconto manual.");
    if (raw.discount > raw.subtotal) throw new Error("Desconto não pode superar o subtotal.");
    const supplied = parseIncomingOrder(raw);
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: existing } = await db.from("idempotency_keys").select("response_body,status_code").eq("key", key).maybeSingle();
    if (existing) return NextResponse.json(existing.response_body, { status: existing.status_code || 200 });

    const quote = await quoteCommercialTerms({
      items: supplied.items,
      channel: supplied.channel,
      couponCode: supplied.couponCode,
      city: supplied.address?.city,
      district: supplied.address?.district,
      allowReward: hasReward,
    });
    const discount = supplied.couponCode ? quote.discount : Math.min(quote.subtotal, supplied.discount);
    const order = parseIncomingOrder({ ...supplied, items: quote.items, subtotal: quote.subtotal, discount, deliveryFee: quote.deliveryFee, total: Math.max(0, quote.subtotal - discount + quote.deliveryFee), couponCode: quote.couponCode });
    const { data: transaction, error } = await db.rpc("create_internal_order_transaction", { p_order: order, p_reward_token: metadata.rewardAuthorizationToken || null, p_actor_id: auth.userId === "demo" ? null : auth.userId, p_discount_reason: metadata.discountReason || null });
    if (error) throw error;
    const createdId = String(transaction?.id || order.id);
    const accessToken = randomBytes(24).toString("base64url");
    const { error: accessError } = await db.from("order_access_tokens").insert({ order_id: createdId, token_hash: createHash("sha256").update(accessToken).digest("hex") });
    if (accessError) throw accessError;
    await db.rpc("enqueue_order_print_jobs", { p_order_id: createdId });
    const { data: created, error: createdError } = await db.from("orders").select("daily_number,number,status,payment_status,total_cents").eq("id", createdId).single();
    if (createdError) throw createdError;
    const response = { id: createdId, number: Number(created.daily_number ?? created.number), status: created.status, paymentStatus: created.payment_status, total: created.total_cents, accessToken, quote: { ...quote, discount, total: order.total } };
    await db.from("idempotency_keys").insert({ key, scope: "orders:create-internal", response_body: response, status_code: 201 });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: apiErrorMessage(error, "Pedido interno inválido.") }, { status: 400 });
  }
}

