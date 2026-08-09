import type {
  ApprovalRequest,
  ChecklistRun,
  ChecklistRunItem,
  ControlCenterSnapshot,
  ExtendedStoreRuntimeStatus,
  GlobalSearchResult,
  InternalNotification,
  OperationTask,
  PrintProfile,
  SystemHealthCheck,
} from "@/types";

export const roleLabels: Record<string, string> = {
  manager: "Gestor",
  counter: "Atendente",
  waiter: "Garçom",
  kitchen: "Cozinha",
  bar: "Bar",
  driver: "Motoboy",
  finance: "Financeiro",
  viewer: "Consulta",
};

export const taskStatusLabels: Record<OperationTask["status"], string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const approvalActionLabels: Record<string, string> = {
  order_discount: "Desconto em pedido",
  order_cancel: "Cancelamento de pedido",
  payment_refund: "Estorno de pagamento",
  order_reopen: "Reabertura de pedido",
  cash_reopen: "Reabertura de caixa",
  stock_adjustment: "Correção de estoque",
  loyalty_adjustment: "Correção de fidelidade",
  price_change: "Alteração de preço",
  courtesy: "Cortesia",
  cash_difference: "Fechamento com divergência",
};

export const healthLabels: Record<string, string> = {
  database: "Banco de dados",
  authentication: "Autenticação",
  realtime: "Atualizações em tempo real",
  print_bridge: "Agente de impressão",
  queues: "Filas operacionais",
  migrations: "Migrations do banco",
  storage: "Arquivos e imagens",
  integrations: "Integrações externas",
};

export function mapStoreRuntime(row: Record<string, unknown>): ExtendedStoreRuntimeStatus {
  return {
    operationalStatus: String(row.operational_status || "closed") as ExtendedStoreRuntimeStatus["operationalStatus"],
    acceptingOrders: Boolean(row.accepting_orders),
    pauseReason: typeof row.pause_reason === "string" ? row.pause_reason : undefined,
    manualOverride: Boolean(row.manual_override),
    activeChannels: Array.isArray(row.active_channels)
      ? (row.active_channels as ExtendedStoreRuntimeStatus["activeChannels"])
      : ["own_delivery", "pickup", "counter", "dine_in", "table_qr"],
    preparationMinutes: Number(row.preparation_minutes || 45),
    deliveryMinutes: Number(row.delivery_minutes || 60),
    temporaryUntil: typeof row.temporary_until === "string" ? row.temporary_until : undefined,
    publicMessage: typeof row.public_message === "string" ? row.public_message : undefined,
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export function mapChecklistItem(row: Record<string, unknown>): ChecklistRunItem {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    title: String(row.title_snapshot),
    description: String(row.description_snapshot || ""),
    required: Boolean(row.required),
    sortOrder: Number(row.sort_order || 0),
    status: String(row.status || "pending") as ChecklistRunItem["status"],
    note: typeof row.note === "string" ? row.note : undefined,
    actor: typeof row.completed_by_label === "string" ? row.completed_by_label : undefined,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
  };
}

export function mapChecklistRun(
  row: Record<string, unknown>,
  items: ChecklistRunItem[] = [],
): ChecklistRun {
  const startedProfile = row.started_profile as { display_name?: string } | null | undefined;
  const completedProfile = row.completed_profile as { display_name?: string } | null | undefined;
  const rawSummary = row.summary && typeof row.summary === "object" ? row.summary : undefined;
  return {
    id: String(row.id),
    phase: String(row.phase) as ChecklistRun["phase"],
    businessDate: String(row.business_date),
    status: String(row.status) as ChecklistRun["status"],
    startedAt: String(row.started_at),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
    startedBy: startedProfile?.display_name,
    completedBy: completedProfile?.display_name,
    notes: typeof row.notes === "string" ? row.notes : undefined,
    summary: rawSummary as ChecklistRun["summary"],
    items: [...items].sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function mapOperationTask(row: Record<string, unknown>): OperationTask {
  const assignee = row.assignee as { display_name?: string } | null | undefined;
  const creator = row.creator as { display_name?: string } | null | undefined;
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description || ""),
    sourceType: typeof row.source_type === "string" ? row.source_type : undefined,
    sourceId: typeof row.source_id === "string" ? row.source_id : undefined,
    priority: String(row.priority || "normal") as OperationTask["priority"],
    status: String(row.status || "open") as OperationTask["status"],
    assignedTo: typeof row.assigned_to === "string" ? row.assigned_to : undefined,
    assignedToName: assignee?.display_name,
    dueAt: typeof row.due_at === "string" ? row.due_at : undefined,
    createdBy: creator?.display_name,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
  };
}

export function mapApproval(row: Record<string, unknown>): ApprovalRequest {
  const requester = row.requester as { display_name?: string } | null | undefined;
  const reviewer = row.reviewer as { display_name?: string } | null | undefined;
  return {
    id: String(row.id),
    actionType: String(row.action_type),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    reason: String(row.reason),
    requestedPayload:
      row.requested_payload && typeof row.requested_payload === "object"
        ? (row.requested_payload as Record<string, unknown>)
        : {},
    status: String(row.status || "pending") as ApprovalRequest["status"],
    requestedBy: typeof row.requested_by === "string" ? row.requested_by : undefined,
    requestedByName: requester?.display_name,
    reviewedBy: typeof row.reviewed_by === "string" ? row.reviewed_by : undefined,
    reviewedByName: reviewer?.display_name,
    requestedAt: String(row.requested_at),
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : undefined,
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : undefined,
    reviewNote: typeof row.review_note === "string" ? row.review_note : undefined,
  };
}

export function mapInternalNotification(row: Record<string, unknown>): InternalNotification {
  return {
    id: String(row.id),
    category: String(row.category || "operation"),
    priority: String(row.priority || "normal") as InternalNotification["priority"],
    title: String(row.title),
    body: String(row.body || ""),
    href: typeof row.href === "string" ? row.href : undefined,
    readAt: typeof row.read_at === "string" ? row.read_at : undefined,
    dismissedAt: typeof row.dismissed_at === "string" ? row.dismissed_at : undefined,
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : undefined,
    createdAt: String(row.created_at),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

export function mapHealthCheck(row: Record<string, unknown>): SystemHealthCheck {
  const key = String(row.key);
  return {
    key,
    label: healthLabels[key] || key,
    status: String(row.status || "unknown") as SystemHealthCheck["status"],
    detail: String(row.detail || "Sem diagnóstico registrado."),
    checkedAt: String(row.checked_at || new Date().toISOString()),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

export function mapPrintProfile(row: Record<string, unknown>): PrintProfile {
  return {
    key: String(row.key),
    name: String(row.name),
    manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : undefined,
    model: typeof row.model === "string" ? row.model : undefined,
    widthMm: Number(row.width_mm || 80) as PrintProfile["widthMm"],
    paperColumns: Number(row.paper_columns || 42),
    connectionType: String(row.connection_type || "usb") as PrintProfile["connectionType"],
    connectionConfig:
      row.connection_config && typeof row.connection_config === "object"
        ? (row.connection_config as Record<string, unknown>)
        : {},
    sector: String(row.sector || "kitchen"),
    autoPrint: Boolean(row.auto_print),
    copies: Number(row.copies || 1),
    active: Boolean(row.active),
    template:
      row.template && typeof row.template === "object"
        ? (row.template as PrintProfile["template"])
        : {},
  };
}

export function buildDemoControlCenter(): ControlCenterSnapshot {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    store: {
      operationalStatus: "open",
      acceptingOrders: true,
      manualOverride: true,
      activeChannels: ["own_delivery", "pickup", "counter", "dine_in", "table_qr"],
      preparationMinutes: 45,
      deliveryMinutes: 60,
      updatedAt: now,
    },
    cash: { open: true, openedAt: now, initial: 20000, expected: 48650 },
    orders: {
      active: 7,
      received: 2,
      preparing: 3,
      ready: 2,
      delayed: 1,
      unviewed: 1,
      unpaid: 3,
      delivery: 2,
      completedToday: 18,
      cancelledToday: 1,
      revenueToday: 184500,
      averageTicket: 7890,
    },
    salon: { occupiedTables: 4, openTabs: 6, partialTables: 1 },
    delivery: { availableDrivers: 2, totalDrivers: 3, activeDeliveries: 1, waitingDriver: 1 },
    stock: { lowItems: 2, outItems: 0 },
    reliability: { failedPrintJobs: 0, failedIntegrationEvents: 0, pendingSync: 0 },
    people: { activeUsers: 5 },
    pending: { tasks: 3, approvals: 1, notifications: 4, incidents: 1 },
  };
}

export function demoSearch(query: string): GlobalSearchResult[] {
  const normalized = query.trim().toLowerCase();
  const results: GlobalSearchResult[] = [
    { id: "order-1048", kind: "order", title: "Pedido #1048", subtitle: "Maria Souza • Delivery • Em preparo", href: "/painel/pedidos?order=order_1048", badge: "Em preparo", keywords: "1048 maria souza delivery" },
    { id: "customer-maria", kind: "customer", title: "Maria Souza", subtitle: "(11) 97000-0000 • 12 pedidos", href: "/painel/clientes?query=Maria%20Souza", badge: "Cliente", keywords: "maria souza 11970000000" },
    { id: "table-5", kind: "table", title: "Mesa 5", subtitle: "Comanda João • R$ 126,00", href: "/painel/salao?mesa=5", badge: "Ocupada", keywords: "mesa 5 joao" },
    { id: "product-coke", kind: "product", title: "Coca-Cola 2 L", subtitle: "Bebida • Estoque 8", href: "/painel/cardapio?query=Coca-Cola", badge: "Produto", keywords: "coca cola bebida" },
    { id: "task-stock", kind: "task", title: "Conferir estoque de refrigerantes", subtitle: "Prioridade alta • vence hoje", href: "/painel/tarefas", badge: "Tarefa", keywords: "estoque refrigerantes tarefa" },
  ];
  return results.filter((item) => `${item.title} ${item.subtitle} ${item.keywords || ""}`.toLowerCase().includes(normalized));
}

export function mapSupplier(row: Record<string, unknown>): import("@/types").SupplierRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    document: typeof row.document === "string" ? row.document : undefined,
    phone: typeof row.phone === "string" ? row.phone : undefined,
    email: typeof row.email === "string" ? row.email : undefined,
    notes: typeof row.notes === "string" ? row.notes : undefined,
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapPurchaseOrder(
  row: Record<string, unknown>,
  items: import("@/types").PurchaseOrderItemRecord[] = [],
): import("@/types").PurchaseOrderRecord {
  const supplier = row.supplier as { name?: string } | null | undefined;
  return {
    id: String(row.id),
    number: Number(row.number),
    supplierId: typeof row.supplier_id === "string" ? row.supplier_id : undefined,
    supplierName: supplier?.name,
    status: String(row.status || "draft") as import("@/types").PurchaseOrderRecord["status"],
    expectedAt: typeof row.expected_at === "string" ? row.expected_at : undefined,
    total: Number(row.total_cents || 0),
    notes: typeof row.notes === "string" ? row.notes : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    receivedAt: typeof row.received_at === "string" ? row.received_at : undefined,
    items,
  };
}
