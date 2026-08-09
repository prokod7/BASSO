import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  IfoodAdapter,
  ifoodEventCode,
  ifoodOrderId,
  type IfoodWebhookEvent,
} from "@/lib/integrations/ifood";
import { Food99Adapter } from "@/lib/integrations/food99";
import type { ExternalOrder, MarketplaceAdapter } from "@/lib/integrations/types";
import type { OrderStatus } from "@/types";

export interface IntegrationEventRow {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  direction: "incoming" | "outgoing";
  payload: any;
  attempts: number;
}

export function integrationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map(value => value.trim());
    if (parts.length) return [...new Set(parts)].join(" • ");
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized.slice(0, 1800);
    } catch {
      // Continua para a mensagem segura abaixo.
    }
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Falha desconhecida sem detalhes do fornecedor.";
}

function adapter(provider: string): MarketplaceAdapter {
  if (provider === "ifood") return new IfoodAdapter();
  if (provider === "99food") return new Food99Adapter();
  throw new Error(`Provedor sem adaptador: ${provider}`);
}

function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function reconcileMarketplaceTotals(
  subtotalInput: number,
  deliveryFeeInput: number,
  discountInput: number,
  totalInput: number,
): { subtotal: number; deliveryFee: number; discount: number; total: number } {
  const subtotal = cents(subtotalInput);
  let deliveryFee = cents(deliveryFeeInput);
  let discount = Math.min(subtotal + deliveryFee, cents(discountInput));
  const calculated = Math.max(0, subtotal - discount + deliveryFee);
  const total = cents(totalInput) || calculated;
  const difference = total - calculated;

  // O iFood pode incluir taxas adicionais. O schema local possui um campo único
  // de taxas, então diferenças positivas são agregadas à taxa de entrega.
  if (difference > 0) deliveryFee += difference;
  if (difference < 0) discount += Math.abs(difference);

  return { subtotal, deliveryFee, discount, total };
}

function stableId(provider: string, externalId: string): string {
  return `${provider}_${createHash("sha256").update(externalId).digest("hex").slice(0, 24)}`;
}

async function loadMappings(provider: string, externalIds: string[]) {
  const db = createAdminClient();
  if (!db || externalIds.length === 0) return new Map<string, any>();
  const { data, error } = await db.from("integration_mappings")
    .select("external_id,internal_kind,internal_id,config")
    .eq("provider", provider)
    .eq("active", true)
    .in("external_id", externalIds);
  if (error) throw error;
  return new Map((data || []).map((row: any) => [row.external_id, row]));
}

async function notifyNewMarketplaceOrder(order: ExternalOrder, internalId: string): Promise<void> {
  const db = createAdminClient();
  if (!db) return;
  await db.from("internal_notifications").insert({
    category: "order",
    priority: "high",
    title: `Novo pedido iFood #${order.displayId}`,
    body: `${order.customerDisplayName} • R$ ${(order.totalCents / 100).toFixed(2).replace(".", ",")} • aguardando confirmação`,
    href: "/painel/pedidos",
    metadata: { orderId: internalId, externalId: order.externalId, provider: order.provider },
  });
}

async function notifyIfoodCancellationRequest(externalId: string, payload: unknown): Promise<void> {
  const db = createAdminClient();
  if (!db) return;
  const { data: order } = await db.from("orders")
    .select("id,number")
    .eq("channel", "ifood")
    .eq("external_id", externalId)
    .maybeSingle();
  await db.from("internal_notifications").insert({
    category: "order",
    priority: "urgent",
    title: order ? `Cancelamento solicitado no pedido #${order.number}` : "Cancelamento solicitado no iFood",
    body: "Abra o pedido e confira a solicitação de cancelamento recebida do iFood.",
    href: "/painel/pedidos",
    metadata: { orderId: order?.id || null, externalId, provider: "ifood", payload },
  });
}

export async function persistMarketplaceOrder(order: ExternalOrder): Promise<{ id: string; duplicate: boolean }> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  if (!order.externalId) throw new Error("Pedido de marketplace sem identificador externo.");
  if (!order.items.length) throw new Error("Pedido de marketplace sem itens.");
  const sourceKey = `${order.provider}:${order.externalId}`;
  const { data: existing, error: existingError } = await db.from("orders").select("id").eq("source_idempotency_key", sourceKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { id: existing.id, duplicate: true };

  const mappings = await loadMappings(order.provider, order.items.map(item => item.externalProductId).filter(Boolean) as string[]);
  const id = stableId(order.provider, order.externalId);
  const items = order.items.map((item, index) => {
    const mapping = item.externalProductId ? mappings.get(item.externalProductId) : undefined;
    const kind = mapping?.internal_kind === "combo" ? "combo" : mapping?.internal_kind === "flavor" ? "pizza" : "product";
    const sector = mapping?.config?.sector || (kind === "product" && mapping?.internal_kind === "product" ? "bar" : "kitchen");
    const optionTotal = item.options.reduce((sum, option) => sum + cents(option.priceCents) * Math.max(1, option.quantity), 0);
    return {
      id: `${id}_${index + 1}`,
      order_id: id,
      kind,
      name_snapshot: item.name,
      quantity: Math.max(1, Math.round(item.quantity)),
      unit_price_cents: cents(item.unitPriceCents + optionTotal),
      product_id: mapping?.internal_id || null,
      selection: {
        externalItemId: item.externalId,
        externalProductId: item.externalProductId,
        options: item.options,
        notes: item.notes,
        marketplace: order.provider,
      },
      sector,
    };
  });

  const totals = reconcileMarketplaceTotals(
    order.subtotalCents || items.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0),
    order.deliveryFeeCents,
    order.discountCents,
    order.totalCents,
  );

  const orderRow = {
    id,
    number: 1,
    channel: order.provider,
    status: "received",
    payment_status: order.paid ? "paid" : "pending",
    customer_name: order.customerDisplayName,
    customer_phone: order.customerPhone || "",
    address: order.deliveryAddress || null,
    subtotal_cents: totals.subtotal,
    discount_cents: totals.discount,
    delivery_fee_cents: totals.deliveryFee,
    total_cents: totals.total,
    payment_method: order.paymentMethod,
    notes: order.notes || null,
    source_idempotency_key: sourceKey,
    external_id: order.externalId,
    external_payload: order.raw,
    created_at: order.createdAt,
    updated_at: new Date().toISOString(),
  };

  const { data: result, error: transactionError } = await db.rpc("create_marketplace_order_transaction", { p_order: orderRow, p_items: items });
  if (transactionError) throw transactionError;
  const persisted = { id: result?.id || id, duplicate: Boolean(result?.duplicate) };
  if (!persisted.duplicate) {
    if (order.notes) await db.from("orders").update({ notes: order.notes }).eq("id", persisted.id);
    await notifyNewMarketplaceOrder(order, persisted.id);
  }
  return persisted;
}

async function syncIfoodOrderStatus(externalId: string, status: OrderStatus, source: string, reason?: string): Promise<void> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  const { data: order, error: readError } = await db.from("orders")
    .select("id,status,payment_status,version")
    .eq("channel", "ifood")
    .eq("external_id", externalId)
    .maybeSingle();
  if (readError) throw readError;
  if (!order || order.status === status) return;

  const patch: Record<string, unknown> = {
    status,
    version: Number(order.version || 1) + 1,
    updated_at: new Date().toISOString(),
  };
  if (status === "cancelled") patch.payment_status = order.payment_status === "paid" ? "refunded" : "cancelled";
  if (status === "completed" && order.payment_status === "pending") patch.payment_status = "paid";
  const { error } = await db.from("orders").update(patch).eq("id", order.id);
  if (error) throw error;
  await db.from("order_status_history").insert({
    order_id: order.id,
    from_status: order.status,
    to_status: status,
    reason: reason || null,
    source,
  });
  await db.from("audit_logs").insert({
    actor_label: "iFood",
    action: "IFOOD_ORDER_STATUS_SYNCED",
    entity_type: "order",
    entity_id: order.id,
    origin: "ifood_webhook",
    before_data: { status: order.status },
    after_data: { status },
    reason: reason || null,
  });
}

function matches(code: string, ...candidates: string[]): boolean {
  const normalized = code.replace(/^ORDER_/, "");
  return candidates.some(candidate => normalized === candidate || code === candidate);
}

async function ensureIfoodOrder(ifood: IfoodAdapter, externalId: string): Promise<{ id: string; duplicate: boolean }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const details = await ifood.getOrder(externalId);
      return persistMarketplaceOrder(ifood.normalizeOrder(details));
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Não foi possível importar o pedido ${externalId}: ${integrationErrorMessage(lastError)}`);
}

async function processIfoodIncoming(event: IntegrationEventRow): Promise<void> {
  const payload = (event.payload || {}) as IfoodWebhookEvent;
  const code = ifoodEventCode(payload);
  if (code === "KEEPALIVE") return;
  const externalId = ifoodOrderId(payload);
  if (!externalId) return;
  const ifood = new IfoodAdapter();

  if (matches(code, "PLACED", "PLC", "CONFIRMED", "CFM")) {
    await ensureIfoodOrder(ifood, externalId);
    if (matches(code, "CONFIRMED", "CFM")) {
      await syncIfoodOrderStatus(externalId, "confirmed", "ifood_webhook");
    } else if (process.env.MARKETPLACE_AUTO_ACCEPT === "true") {
      await ifood.acceptOrder(externalId);
    }
    return;
  }

  if (matches(code, "PREPARATION_STARTED", "PRS")) {
    await syncIfoodOrderStatus(externalId, "preparing", "ifood_webhook");
    return;
  }
  if (matches(code, "PREPARATION_ENDED", "READY_TO_PICKUP", "RTP")) {
    await syncIfoodOrderStatus(externalId, "ready", "ifood_webhook");
    return;
  }
  if (matches(code, "DISPATCHED", "DSP")) {
    await syncIfoodOrderStatus(externalId, "out_for_delivery", "ifood_webhook");
    return;
  }
  if (matches(code, "CONCLUDED", "CON")) {
    await syncIfoodOrderStatus(externalId, "completed", "ifood_webhook");
    return;
  }
  if (matches(code, "CANCELLED", "CAN")) {
    await syncIfoodOrderStatus(externalId, "cancelled", "ifood_webhook", "Cancelado no iFood");
    return;
  }
  if (matches(code, "CANCELLATION_REQUESTED")) {
    await notifyIfoodCancellationRequest(externalId, payload);
  }
}

async function processRedeWebhook(payload: any): Promise<void> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  const externalId = String(payload.tid || payload.transactionId || payload.id || "");
  if (!externalId) throw new Error("Transação Rede sem identificador.");
  const rawStatus = String(payload.status || payload.transactionStatus || "").toLowerCase();
  const status = rawStatus.includes("approved") || rawStatus.includes("captured") ? "paid" : rawStatus.includes("refund") ? "refunded" : rawStatus.includes("cancel") ? "cancelled" : "pending";
  const { data: payment, error } = await db.from("payments").update({ status, metadata: payload, updated_at: new Date().toISOString() }).eq("external_id", externalId).select("order_id").maybeSingle();
  if (error) throw error;
  if (!payment) throw new Error("Pagamento Rede não localizado.");
  if (payment.order_id && status === "paid") {
    const { data: order } = await db.from("orders").select("total_cents").eq("id", payment.order_id).single();
    const { data: paidRows } = await db.from("payments").select("amount_cents").eq("order_id", payment.order_id).eq("status", "paid");
    const paid = (paidRows || []).reduce((sum: number, row: any) => sum + Number(row.amount_cents), 0);
    await db.from("orders").update({ payment_status: paid >= Number(order?.total_cents || 0) ? "paid" : "partial", updated_at: new Date().toISOString() }).eq("id", payment.order_id);
  }
}

export async function processIntegrationEvent(event: IntegrationEventRow): Promise<void> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  try {
    if (event.provider === "rede") {
      await processRedeWebhook(event.payload);
    } else if (event.provider === "ifood" && event.direction === "incoming") {
      await processIfoodIncoming(event);
    } else {
      const providerAdapter = adapter(event.provider);
      if (event.direction === "outgoing") {
        const externalId = String(event.payload?.externalId || "");
        if (!externalId) throw new Error("Evento de saída sem pedido externo.");
        if (event.event_type === "ORDER_CANCELLED") {
          await providerAdapter.cancelOrder(externalId, String(event.payload?.reason || "Cancelado pela operação"), event.payload?.cancellationCode);
        } else {
          await providerAdapter.updateStatus(externalId, event.payload?.status);
        }
      } else {
        const normalized = providerAdapter.normalizeOrder(event.payload);
        await persistMarketplaceOrder(normalized);
        if (process.env.MARKETPLACE_AUTO_ACCEPT === "true") await providerAdapter.acceptOrder(normalized.externalId);
      }
    }
    await db.rpc("finish_integration_event", { p_id: event.id, p_success: true, p_error: null });
  } catch (error) {
    const message = integrationErrorMessage(error);
    await db.rpc("finish_integration_event", { p_id: event.id, p_success: false, p_error: message });
    throw new Error(message);
  }
}

export async function drainIntegrationQueue(limit = 10): Promise<{ claimed: number; completed: number; failed: number }> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  const { data: events, error } = await db.rpc("claim_integration_events", { p_limit: Math.max(1, Math.min(limit, 50)) });
  if (error) throw error;
  const result = { claimed: events?.length || 0, completed: 0, failed: 0 };
  for (const event of events || []) {
    try {
      await processIntegrationEvent(event as IntegrationEventRow);
      result.completed += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
