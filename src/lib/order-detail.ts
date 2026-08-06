import type {
  OrderDetail,
  ManagedOrderItem,
  OrderPaymentRecord,
  OrderTimelineEntry,
  OrderInternalNote,
  OrderIncident,
  OrderCommunicationLog,
  OrderPrintJob,
} from "@/types";

export function mapOrderRow(row: Record<string, any>, items: ManagedOrderItem[] = []): OrderDetail {
  return {
    id: row.id,
    number: Number(row.number),
    channel: row.channel,
    status: row.status,
    paymentStatus: row.payment_status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone || "",
    customerId: row.customer_id || undefined,
    address: row.address || undefined,
    tableNumber: row.table_number || undefined,
    tabId: row.tab_id || undefined,
    tabName: row.tab_name || undefined,
    items,
    subtotal: Number(row.subtotal_cents || 0),
    discount: Number(row.discount_cents || 0),
    deliveryFee: Number(row.delivery_fee_cents || 0),
    total: Number(row.total_cents || 0),
    paymentMethod: row.payment_method,
    changeFor: row.change_for_cents || undefined,
    notes: row.notes || undefined,
    couponCode: row.coupon_code || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trackingToken: undefined,
    driverId: row.driver_id || undefined,
    sourceIdempotencyKey: row.source_idempotency_key,
    priority: row.priority || "normal",
    estimatedReadyAt: row.estimated_ready_at || undefined,
    viewedAt: row.viewed_at || undefined,
    assignedTo: row.assigned_to || undefined,
    internalSummary: row.internal_summary || undefined,
    version: Number(row.version || 1),
    paidAmount: 0,
    balanceDue: Number(row.total_cents || 0),
    timeline: [],
    payments: [],
    internalNotes: [],
    incidents: [],
    communications: [],
    printJobs: [],
  };
}

export function mapManagedItem(row: Record<string, any>): ManagedOrderItem {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name_snapshot,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price_cents),
    productId: row.product_id || undefined,
    selection: row.selection || undefined,
    sector: row.sector,
    productionStatus: row.production_status,
    cancelledReason: row.cancelled_reason || undefined,
    updatedAt: row.updated_at || row.created_at,
  };
}

export function mapTimeline(row: Record<string, any>): OrderTimelineEntry {
  return {
    id: String(row.id),
    fromStatus: row.from_status || undefined,
    toStatus: row.to_status,
    reason: row.reason || undefined,
    actor: row.actor_label || undefined,
    source: row.source || "system",
    createdAt: row.created_at,
  };
}

export function mapPayment(row: Record<string, any>): OrderPaymentRecord {
  return {
    id: row.id,
    method: row.method,
    status: row.status,
    amount: Number(row.amount_cents),
    provider: row.provider || undefined,
    terminalId: row.terminal_id || undefined,
    authorizationCode: row.authorization_code || undefined,
    createdBy: row.created_by_label || undefined,
    createdAt: row.created_at,
  };
}

export function mapNote(row: Record<string, any>): OrderInternalNote {
  return {
    id: row.id,
    body: row.body,
    pinned: Boolean(row.pinned),
    actor: row.created_by_label || "Equipe",
    createdAt: row.created_at,
  };
}

export function mapIncident(row: Record<string, any>): OrderIncident {
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description || "",
    status: row.status,
    resolution: row.resolution || undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || undefined,
  };
}

export function mapCommunication(row: Record<string, any>): OrderCommunicationLog {
  return {
    id: row.id,
    channel: row.channel,
    templateKey: row.template_key || undefined,
    recipient: row.recipient || undefined,
    message: row.message_snapshot,
    status: row.status,
    actor: row.created_by_label || "Equipe",
    createdAt: row.created_at,
  };
}

export function mapPrintJob(row: Record<string, any>): OrderPrintJob {
  return {
    id: row.id,
    sector: row.sector,
    printerKey: row.printer_key,
    status: row.status,
    attempts: Number(row.attempts || 0),
    isReprint: Boolean(row.is_reprint),
    lastError: row.last_error || undefined,
    createdAt: row.created_at,
  };
}
