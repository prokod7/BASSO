import type { StoreRuntimeStatus } from "./index";

export type ChecklistItemStatus = "pending" | "done" | "skipped" | "blocked";
export type OperationTaskStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type SystemHealthStatus = "operational" | "warning" | "error" | "unknown";
export type ExpeditionStatus = "pending" | "checking" | "approved" | "returned";
export type ChecklistPhase = "opening" | "closing";

export interface ExtendedStoreRuntimeStatus extends StoreRuntimeStatus {
  activeChannels: Array<"own_delivery" | "pickup" | "counter" | "dine_in" | "table_qr">;
  preparationMinutes: number;
  deliveryMinutes: number;
  temporaryUntil?: string;
  publicMessage?: string;
}

export interface ChecklistRunItem {
  id: string;
  templateId: string;
  title: string;
  description: string;
  required: boolean;
  sortOrder: number;
  status: ChecklistItemStatus;
  note?: string;
  actor?: string;
  completedAt?: string;
}

export interface ChecklistRun {
  id: string;
  phase: ChecklistPhase;
  businessDate: string;
  status: "in_progress" | "completed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  startedBy?: string;
  completedBy?: string;
  notes?: string;
  summary?: { total: number; done: number; skipped: number; blocked: number };
  items: ChecklistRunItem[];
}

export interface OperationTask {
  id: string;
  title: string;
  description: string;
  sourceType?: string;
  sourceId?: string;
  priority: NotificationPriority;
  status: OperationTaskStatus;
  assignedTo?: string;
  assignedToName?: string;
  dueAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequest {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  reason: string;
  requestedPayload: Record<string, unknown>;
  status: ApprovalStatus;
  requestedBy?: string;
  requestedByName?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  requestedAt: string;
  reviewedAt?: string;
  expiresAt?: string;
  reviewNote?: string;
}

export interface InternalNotification {
  id: string;
  category: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  href?: string;
  readAt?: string;
  dismissedAt?: string;
  expiresAt?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface SystemHealthCheck {
  key: string;
  label: string;
  status: SystemHealthStatus;
  detail: string;
  checkedAt: string;
  metadata?: Record<string, unknown>;
}

export interface PrintProfile {
  key: string;
  name: string;
  manufacturer?: string;
  model?: string;
  widthMm: 58 | 80;
  paperColumns: number;
  connectionType: "usb" | "network" | "wifi" | "bluetooth" | "system";
  connectionConfig: Record<string, unknown>;
  sector: string;
  autoPrint: boolean;
  copies: number;
  active: boolean;
  template: {
    fontSize?: "small" | "normal" | "large";
    showLogo?: boolean;
    showCustomer?: boolean;
    showPayment?: boolean;
    showAddress?: boolean;
    highlightNotes?: boolean;
    highlightRemovals?: boolean;
    blockOrder?: string[];
    [key: string]: unknown;
  };
}

export interface GlobalSearchResult {
  id: string;
  kind: "order" | "customer" | "table" | "product" | "driver" | "task" | "financial";
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  keywords?: string;
}

export interface ControlCenterSnapshot {
  generatedAt: string;
  store: ExtendedStoreRuntimeStatus;
  cash: { open: boolean; openedAt?: string; initial: number; expected: number };
  orders: {
    active: number;
    received: number;
    preparing: number;
    ready: number;
    delayed: number;
    unviewed: number;
    unpaid: number;
    delivery: number;
    completedToday: number;
    cancelledToday: number;
    revenueToday: number;
    averageTicket: number;
  };
  salon: { occupiedTables: number; openTabs: number; partialTables: number };
  delivery: { availableDrivers: number; totalDrivers: number; activeDeliveries: number; waitingDriver: number };
  stock: { lowItems: number; outItems: number };
  reliability: { failedPrintJobs: number; failedIntegrationEvents: number; pendingSync: number };
  people: { activeUsers: number };
  pending: { tasks: number; approvals: number; notifications: number; incidents: number };
}

export interface SupplierRecord {
  id: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItemRecord {
  id: string;
  productId: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  expiresAt?: string;
}

export interface PurchaseOrderRecord {
  id: string;
  number: number;
  supplierId?: string;
  supplierName?: string;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  expectedAt?: string;
  total: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
  items: PurchaseOrderItemRecord[];
}

export type AttentionSeverity = "info" | "warning" | "danger";
export type AttentionKind = "order" | "payment" | "delivery" | "salon" | "stock" | "print" | "cash" | "approval" | "incident" | "system";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  href: string;
  createdAt?: string;
  ageMinutes?: number;
  metadata?: Record<string, unknown>;
}

export interface AttentionSnapshot {
  generatedAt: string;
  totals: { all: number; danger: number; warning: number; info: number };
  groups: Record<AttentionKind, number>;
  items: AttentionItem[];
}

export interface FeatureFlagRecord {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  requiresIntegration: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface OrderEditLock {
  acquired: boolean;
  holderId?: string;
  holderLabel?: string;
  expiresAt?: string;
}

export interface SystemAbout {
  appName: string;
  clientName: string;
  version: string;
  environment: string;
  databaseVersion: number | null;
  databaseMigrationName?: string;
  supabaseConfigured: boolean;
  demoMode: boolean;
  generatedAt: string;
}

export interface ConfigurationSnapshotRecord {
  id: string;
  name: string;
  scope: string;
  createdBy?: string;
  createdAt: string;
  restoredAt?: string;
}

export interface InventoryCountItemRecord {
  id: string;
  inventoryItemId: string;
  productId: string;
  name: string;
  systemQuantity: number;
  countedQuantity?: number;
  difference: number;
  unit: string;
}

export interface InventoryCountRecord {
  id: string;
  status: "open" | "completed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  items: InventoryCountItemRecord[];
}
