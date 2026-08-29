import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderChannel, OrderStatus, PaymentMethod, PaymentStatus } from "@/types";
import { mapFiscalPaymentMethod, mapFulfillment, mapOrderSource, paymentMethodsForFilter } from "./mappings";
import type { FiscalQuery, FiscalStatusFilter } from "./schemas";
import { encodeFiscalCursor } from "./schemas";

const ORDER_COLUMNS = [
  "id",
  "number",
  "channel",
  "status",
  "payment_status",
  "customer_name",
  "payment_method",
  "subtotal_cents",
  "discount_cents",
  "delivery_fee_cents",
  "total_cents",
  "coupon_code",
  "created_at",
  "deleted_at",
  "order_origin",
].join(",");

const ITEM_COLUMNS = [
  "id",
  "order_id",
  "product_id",
  "name_snapshot",
  "quantity",
  "unit_price_cents",
  "selection",
  "kind",
  "sector",
  "production_status",
  "created_at",
].join(",");

const PAYMENT_COLUMNS = [
  "order_id",
  "method",
  "status",
  "amount_cents",
  "created_at",
].join(",");

export type FiscalOrderRow = {
  id: string;
  number: number | string;
  channel: OrderChannel;
  status: OrderStatus;
  payment_status: PaymentStatus;
  customer_name: string;
  payment_method: PaymentMethod;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  coupon_code: string | null;
  created_at: string;
  deleted_at: string | null;
  order_origin: string | null;
};

export type FiscalItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price_cents: number;
  selection: unknown;
  kind: string;
  sector: string;
  production_status: string;
  created_at: string;
};

export type FiscalPaymentRow = {
  order_id: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_cents: number;
  created_at: string;
};

export function isFiscalEligibleOrder(row: FiscalOrderRow, statusFilter: FiscalStatusFilter = "completed") {
  if (row.deleted_at) return false;
  if (row.status === "cancelled") return false;
  if (statusFilter !== "all" && row.status !== statusFilter) return false;
  if (!row.id || !row.customer_name || !row.created_at) return false;
  if (!Number.isFinite(Number(row.number)) || Number(row.number) <= 0) return false;
  if (!Number.isInteger(row.subtotal_cents) || row.subtotal_cents < 0) return false;
  if (!Number.isInteger(row.discount_cents) || row.discount_cents < 0) return false;
  if (!Number.isInteger(row.delivery_fee_cents) || row.delivery_fee_cents < 0) return false;
  if (!Number.isInteger(row.total_cents) || row.total_cents < 0) return false;
  const expectedTotal = Math.max(0, row.subtotal_cents - row.discount_cents + row.delivery_fee_cents);
  return expectedTotal === row.total_cents;
}

function isValidItem(row: FiscalItemRow) {
  return row.production_status !== "cancelled" &&
    Boolean(row.id && row.order_id && row.name_snapshot) &&
    Number.isInteger(row.quantity) && row.quantity > 0 &&
    Number.isInteger(row.unit_price_cents) && row.unit_price_cents >= 0;
}

function groupByOrder<T extends { order_id: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.order_id) continue;
    const current = grouped.get(row.order_id) || [];
    current.push(row);
    grouped.set(row.order_id, current);
  }
  return grouped;
}

export function mapFiscalOrder(
  row: FiscalOrderRow,
  itemRows: FiscalItemRow[],
  paymentRows: FiscalPaymentRow[],
) {
  const items = itemRows.filter(isValidItem).map(item => ({
    id: item.id,
    productId: item.product_id,
    sku: item.product_id,
    kind: item.kind,
    name: item.name_snapshot,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
    totalCents: item.unit_price_cents * item.quantity,
    selection: item.selection ?? {},
    sector: item.sector,
  }));

  if (!items.length) return null;

  // Alguns pedidos históricos de marketplace possuem componentes comerciais
  // que não foram materializados em order_items (por exemplo, customizações
  // aninhadas). Não criamos um item sintético e não alteramos o pedido: a
  // diferença é exposta explicitamente para reconciliação no Basso Fiscal.
  const itemsSubtotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  const unallocatedSubtotalCents = row.subtotal_cents - itemsSubtotalCents;

  const payments = paymentRows.length
    ? paymentRows.map(payment => ({
        method: mapFiscalPaymentMethod(payment.method),
        status: payment.status,
        amountCents: payment.amount_cents,
      }))
    : [{
        method: mapFiscalPaymentMethod(row.payment_method),
        status: row.payment_status,
        amountCents: row.total_cents,
      }];

  return {
    id: row.id,
    externalId: row.id,
    number: Number(row.number),
    orderedAt: new Date(row.created_at).toISOString(),
    customer: { name: row.customer_name },
    customerTaxId: null,
    channel: row.channel,
    source: mapOrderSource(row.channel, row.order_origin),
    fulfillment: mapFulfillment(row.channel),
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: mapFiscalPaymentMethod(row.payment_method),
    itemsSubtotalCents,
    unallocatedSubtotalCents,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    deliveryFeeCents: row.delivery_fee_cents,
    totalCents: row.total_cents,
    couponCode: row.coupon_code,
    items,
    payments,
  };
}

export type FiscalOrdersResponse = {
  orders: NonNullable<ReturnType<typeof mapFiscalOrder>>[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
};

const EMPTY_RESPONSE: FiscalOrdersResponse = {
  orders: [],
  pagination: { hasMore: false, nextCursor: null },
};

export async function fetchFiscalOrders(db: SupabaseClient, params: FiscalQuery): Promise<FiscalOrdersResponse> {
  // Todos os channels atuais são cobertos pelos mappings conhecidos. "other"
  // permanece no contrato para evolução futura, sem tentar adivinhar um channel inexistente.
  if (params.source === "other") return EMPTY_RESPONSE;

  let query = db.from("orders").select(ORDER_COLUMNS).is("deleted_at", null);

  query = params.status === "all"
    ? query.neq("status", "cancelled")
    : query.eq("status", params.status);

  if (params.startUtc) query = query.gte("created_at", params.startUtc);
  if (params.endExclusiveUtc) query = query.lt("created_at", params.endExclusiveUtc);

  if (params.payment) {
    const methods = paymentMethodsForFilter(params.payment);
    query = methods.length === 1
      ? query.eq("payment_method", methods[0])
      : query.in("payment_method", methods);
  }

  if (params.source === "cardapio") {
    query = query
      .in("channel", ["own_delivery", "pickup"])
      .or("order_origin.eq.web,order_origin.is.null");
  } else if (params.source === "pdv") {
    query = query.or("channel.in.(counter,dine_in),order_origin.in.(counter,whatsapp,phone)");
  } else if (params.source === "mesa") {
    query = query.or("channel.eq.table_qr,order_origin.eq.table");
  } else if (params.source === "ifood") {
    query = query.eq("channel", "ifood");
  } else if (params.source === "99food") {
    query = query.eq("channel", "99food");
  }

  if (params.qTarget?.kind === "number") query = query.eq("number", params.qTarget.value);
  if (params.qTarget?.kind === "id") query = query.eq("id", params.qTarget.value);
  if (params.cursor) query = query.lt("number", params.cursor.lastNumber);

  const { data: orderData, error: orderError } = await query
    .order("number", { ascending: false })
    .limit(params.limit + 1);
  if (orderError) throw orderError;

  const candidates = (orderData || []) as unknown as FiscalOrderRow[];
  const hasMore = candidates.length > params.limit;
  const pageRows = candidates.slice(0, params.limit);
  if (!pageRows.length) return EMPTY_RESPONSE;

  const orderIds = pageRows.map(row => row.id);
  const [itemsResult, paymentsResult] = await Promise.all([
    db.from("order_items")
      .select(ITEM_COLUMNS)
      .in("order_id", orderIds)
      .neq("production_status", "cancelled")
      .order("created_at", { ascending: true }),
    db.from("payments")
      .select(PAYMENT_COLUMNS)
      .in("order_id", orderIds)
      .order("created_at", { ascending: true }),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  const groupedItems = groupByOrder((itemsResult.data || []) as unknown as FiscalItemRow[]);
  const groupedPayments = groupByOrder((paymentsResult.data || []) as unknown as FiscalPaymentRow[]);

  const orders = pageRows
    .filter(row => isFiscalEligibleOrder(row, params.status))
    .map(row => mapFiscalOrder(row, groupedItems.get(row.id) || [], groupedPayments.get(row.id) || []))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  const lastPageRow = pageRows[pageRows.length - 1];
  return {
    orders,
    pagination: {
      hasMore,
      nextCursor: hasMore && lastPageRow ? encodeFiscalCursor(lastPageRow.number) : null,
    },
  };
}
