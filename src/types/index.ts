export type PizzaCategory = "traditional" | "premium" | "sweet";
export type OrderChannel = "own_delivery" | "pickup" | "counter" | "dine_in" | "ifood" | "99food" | "table_qr";
export type OrderStatus = "received" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
export type PaymentStatus = "pending" | "partial" | "paid" | "refunded" | "cancelled";
export type PaymentMethod = "pix" | "cash" | "debit" | "credit" | "meal_voucher" | "food_voucher";
export type OrderPriority = "normal" | "high" | "urgent";
export type ProductionStatus = "queued" | "preparing" | "ready" | "cancelled";

export interface Flavor {
  id: string;
  name: string;
  category: PizzaCategory;
  priceGrande: number;
  priceBroto: number;
  ingredients: string[];
  description: string;
  featured: boolean;
  active: boolean;
}
export interface Addon { id: string; name: string; price: number; active: boolean; maxQuantity: number; }
export interface Product { id: string; name: string; description: string; price: number; active: boolean; stockTracked: boolean; category: "beverages" | "desserts"; image?: string; variant?: string; }
export interface PizzaSelection {
  size: "grande" | "broto";
  mass: "traditional" | "integral";
  flavorA: string;
  flavorB?: string;
  removedA: string[];
  removedB: string[];
  addons: Record<string, number>;
  notes: string;
}
export interface ComboSelection {
  mass: "traditional" | "integral";
  grandeFlavor: "calabresa-tradicional" | "mozzarella";
  brigadeiroBase: "chocolate-ao-leite" | "creme-de-avela";
  beverage: string;
  addons: Record<string, number>;
  notes: string;
}
export interface CartItem {
  id: string;
  kind: "pizza" | "product" | "combo" | "reward";
  name: string;
  quantity: number;
  unitPrice: number;
  image?: string;
  selection?: PizzaSelection | ComboSelection;
  productId?: string;
}
export interface Address {
  cep: string; street: string; number: string; district: string; complement?: string; reference?: string; city: string; state: string; latitude?: number; longitude?: number;
}
export interface Order {
  id: string;
  number: number;
  channel: OrderChannel;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  customerId?: string;
  address?: Address;
  tableNumber?: number;
  tabId?: string;
  tabName?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  changeFor?: number;
  notes?: string;
  couponCode?: string;
  createdAt: string;
  updatedAt: string;
  trackingToken?: string;
  driverId?: string;
  sourceIdempotencyKey: string;
  rewardAuthorizationToken?: string;
  priority?: OrderPriority;
  estimatedReadyAt?: string;
  viewedAt?: string;
  assignedTo?: string;
  internalSummary?: string;
  version?: number;
  paidAmount?: number;
  balanceDue?: number;
}
export interface DemoTable { number: number; capacity: number; status: "free" | "occupied" | "cleaning" | "partial"; people?: number; openedAt?: string; groupId?: string; tabs: DemoTab[]; }
export interface DemoTab { id: string; name: string; items: CartItem[]; paidCents: number; totalCents: number; waiter: string; status: "open" | "partial" | "closed" | "cancelled"; }
export interface Driver { id: string; name: string; phone: string; vehicle: string; available: boolean; latitude?: number; longitude?: number; lastLocationAt?: string; activeOrderId?: string; }
export interface InventoryItem { id: string; productId: string; name: string; unit: string; quantity: number; minQuantity: number; allowNegative: boolean; updatedAt: string; }
export interface Coupon { id: string; code: string; type: "percentage" | "fixed"; value: number; totalLimit: number | null; uses: number; minimum: number | null; channels: OrderChannel[]; active: boolean; startsAt?: string; endsAt?: string; }

export interface CashMovement { id: string; kind: "sale" | "supply" | "withdrawal" | "refund" | "adjustment"; amount: number; reason: string; createdAt: string; actor?: string; }
export interface FinancialEntry { id: string; kind: "income" | "expense"; status: "pending" | "settled" | "cancelled"; description: string; categoryId?: string; categoryName: string; amount: number; dueDate: string; settledAt?: string; paymentMethod?: PaymentMethod; recurring: boolean; notes?: string; createdAt: string; }
export interface CampaignRecord { id: string; name: string; channel: "push" | "email"; segment: { type: "all" | "new" | "active" | "frequent" | "inactive" | "birthday" | "minimum_spend"; minimumSpend?: number }; template: { title: string; message: string; url?: string }; status: "draft" | "scheduled" | "running" | "completed" | "cancelled"; scheduledAt?: string; createdAt: string; metrics: { recipients: number; sent: number; opened: number; converted: number }; }
export interface CrmCustomer { id: string; name: string; phone: string; email?: string; birthDate?: string; notes?: string; validOrders: number; totalSpent: number; averageTicket: number; lastOrderAt?: string; segment: "new" | "active" | "frequent" | "inactive"; consents: { email: boolean; push: boolean; whatsapp: boolean }; }
export interface LoyaltyAccountView { customerId: string; name: string; phone: string; balance: number; lifetimePoints: number; rewardsRedeemed: number; updatedAt: string; pendingAuthorization?: { id: string; flavor_id: string; expires_at: string }; }


export interface ManagedOrderItem extends CartItem {
  sector: "kitchen" | "bar" | "counter";
  productionStatus: ProductionStatus;
  cancelledReason?: string;
  updatedAt?: string;
}

export interface OrderTimelineEntry {
  id: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  reason?: string;
  actor?: string;
  source: string;
  createdAt: string;
}

export interface OrderPaymentRecord {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  provider?: string;
  terminalId?: string;
  authorizationCode?: string;
  createdBy?: string;
  createdAt: string;
}

export interface OrderInternalNote {
  id: string;
  body: string;
  pinned: boolean;
  actor: string;
  createdAt: string;
}

export interface OrderIncident {
  id: string;
  category: "customer" | "address" | "payment" | "production" | "delivery" | "quality" | "other";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  status: "open" | "resolved" | "cancelled";
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface OrderCommunicationLog {
  id: string;
  channel: "manual_whatsapp" | "phone" | "push" | "email" | "internal";
  templateKey?: string;
  recipient?: string;
  message: string;
  status: "opened" | "sent" | "failed" | "cancelled";
  actor: string;
  createdAt: string;
}

export interface OrderPrintJob {
  id: string;
  sector: string;
  printerKey: string;
  status: "queued" | "processing" | "done" | "failed" | "cancelled";
  attempts: number;
  isReprint: boolean;
  lastError?: string;
  createdAt: string;
}

export interface OrderDetail extends Omit<Order, "items"> {
  items: ManagedOrderItem[];
  timeline: OrderTimelineEntry[];
  payments: OrderPaymentRecord[];
  internalNotes: OrderInternalNote[];
  incidents: OrderIncident[];
  communications: OrderCommunicationLog[];
  printJobs: OrderPrintJob[];
}

export interface CommunicationTemplate {
  key: string;
  name: string;
  body: string;
  active: boolean;
  sortOrder: number;
}

export interface StoreRuntimeStatus {
  operationalStatus: "open" | "paused" | "closed";
  acceptingOrders: boolean;
  pauseReason?: string;
  manualOverride: boolean;
  updatedAt: string;
}

export type StoreChannel = "own_delivery" | "pickup" | "counter" | "dine_in" | "table_qr";
export type ChecklistPhase = "opening" | "closing";
export type ChecklistItemStatus = "pending" | "done" | "skipped" | "blocked";
export type OperationTaskStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type SystemHealthStatus = "operational" | "warning" | "error" | "unknown";
export type ExpeditionStatus = "pending" | "checking" | "approved" | "returned";

export interface ExtendedStoreRuntimeStatus extends StoreRuntimeStatus {
  activeChannels: StoreChannel[];
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
  totals: {
    all: number;
    danger: number;
    warning: number;
    info: number;
  };
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
