import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { IfoodAdapter } from "@/lib/integrations/ifood";
import { Food99Adapter } from "@/lib/integrations/food99";
import type { ExternalOrder, MarketplaceAdapter } from "@/lib/integrations/types";
import { resolveFood99OrderFromEvent } from "@/lib/integrations/food99/orders";

export interface IntegrationEventRow {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  direction: "incoming" | "outgoing";
  payload: any;
  attempts: number;
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

export async function persistMarketplaceOrder(order: ExternalOrder): Promise<{ id: string; duplicate: boolean }> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
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
        marketplace: order.provider
      },
      sector
    };
  });

  const subtotal = cents(order.subtotalCents || items.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0));
  const deliveryFee = cents(order.deliveryFeeCents);
  const discount = Math.min(subtotal + deliveryFee, cents(order.discountCents));
  const calculatedTotal = Math.max(0, subtotal - discount + deliveryFee);
  const total = cents(order.totalCents) || calculatedTotal;
  // Preserve provider total while satisfying the database arithmetic constraint.
  const normalizedDiscount = Math.max(0, subtotal + deliveryFee - total);

  const orderRow = {
    id,
    number: 1,
    channel: order.provider,
    status: "received",
    payment_status: order.paid ? "paid" : "pending",
    customer_name: order.customerDisplayName,
    customer_phone: order.customerPhone || "",
    address: order.deliveryAddress || null,
    subtotal_cents: subtotal,
    discount_cents: normalizedDiscount,
    delivery_fee_cents: deliveryFee,
    total_cents: total,
    payment_method: order.paymentMethod,
    source_idempotency_key: sourceKey,
    external_id: order.externalId,
    external_payload: order.raw,
    created_at: order.createdAt,
    updated_at: new Date().toISOString()
  };

  const { data: result, error: transactionError } = await db.rpc("create_marketplace_order_transaction", { p_order: orderRow, p_items: items });
  if (transactionError) throw transactionError;
  return { id: result?.id || id, duplicate: Boolean(result?.duplicate) };
}

export async function processIntegrationEvent(event: IntegrationEventRow): Promise<void> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  try {
    if (event.provider === "rede") {
      throw new Error("Integração Rede/Laranjinha aguardando SDK/App2App oficial; nenhum payload REST é interpretado por suposição.");
    } else {
      const providerAdapter = adapter(event.provider);
      if (event.direction === "outgoing") {
        const externalId = String(event.payload?.externalId || "");
        if (!externalId) throw new Error("Evento de saída sem pedido externo.");
        if (event.event_type === "ORDER_CANCELLED") await providerAdapter.cancelOrder(externalId, String(event.payload?.reason || "Cancelado pela operação"));
        else await providerAdapter.updateStatus(externalId, event.payload?.status);
      } else {
        // 99Food gets an asynchronous resolver because the official webhook may be a
        // notification-only envelope and require a follow-up order detail request.
        // The resolver remains safety-gated until the official documentation is supplied.
        const normalized = event.provider === "99food"
          ? await resolveFood99OrderFromEvent(event.payload)
          : providerAdapter.normalizeOrder(event.payload);
        await persistMarketplaceOrder(normalized);
        if (process.env.MARKETPLACE_AUTO_ACCEPT === "true") await providerAdapter.acceptOrder(normalized.externalId);
      }
    }
    await db.rpc("finish_integration_event", { p_id: event.id, p_success: true, p_error: null });
  } catch (error) {
    await db.rpc("finish_integration_event", { p_id: event.id, p_success: false, p_error: error instanceof Error ? error.message : "Falha desconhecida" });
    throw error;
  }
}

export interface DrainIntegrationQueueResult {
  ok: boolean;
  claimed: number;
  completed: number;
  processed: number;
  failed: number;
}

/**
 * Backward-compatible queue drainer used by older route handlers.
 *
 * Mega Update 06 routes primarily call `processIntegrationEvent` directly after
 * claiming rows, but existing deployments still import `drainIntegrationQueue`.
 * Keeping this exported helper prevents those routes from breaking while using
 * the same claim/process/finalize path and idempotency guarantees.
 */
export async function drainIntegrationQueue(
  limitOrOptions: number | { limit?: number } = 10,
): Promise<DrainIntegrationQueueResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");

  const requestedLimit = typeof limitOrOptions === "number"
    ? limitOrOptions
    : (limitOrOptions.limit ?? 10);
  const limit = Math.max(1, Math.min(100, Math.trunc(requestedLimit || 10)));

  const { data: events, error } = await db.rpc("claim_integration_events", {
    p_limit: limit,
  });
  if (error) throw error;

  let completed = 0;
  let failed = 0;
  const claimed = Array.isArray(events) ? events.length : 0;

  for (const row of events || []) {
    try {
      await processIntegrationEvent(row as IntegrationEventRow);
      completed += 1;
    } catch {
      // `processIntegrationEvent` already records the failed attempt through
      // `finish_integration_event`; the drainer only aggregates the result.
      failed += 1;
    }
  }

  return {
    ok: failed === 0,
    claimed,
    completed,
    processed: completed,
    failed,
  };
}
