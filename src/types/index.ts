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
export interface Product { id: string; name: string; description: string; price: number; active: boolean; stockTracked: boolean; category: string; image?: string; variant?: string; }
export interface MenuCategory { id: string; name: string; kind: string; sortOrder: number; active: boolean; image?: string; }
export type AddonPlacement = "whole" | "halfA" | "halfB";
export interface PizzaSelection {
  size: "grande" | "broto";
  mass: "traditional" | "integral";
  flavorA: string;
  flavorB?: string;
  removedA: string[];
  removedB: string[];
  addons: Record<string, number>;
  addonPlacements?: Record<string, AddonPlacement>;
  notes: string;
}
export interface ComboSelection {
  mass: "traditional" | "integral";
  grandeFlavor: string;
  grandeFlavorB?: string;
  brigadeiroBase: "chocolate-ao-leite" | "creme-de-avela";
  beverage: string;
  addons: Record<string, number>;
  addonPlacements?: Record<string, AddonPlacement>;
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
  origin?: "web" | "whatsapp" | "phone" | "counter" | "table" | "marketplace";
  externalId?: string;
  priority?: OrderPriority;
  estimatedReadyAt?: string;
  viewedAt?: string;
  assignedTo?: string;
  internalSummary?: string;
  version?: number;
  paidAmount?: number;
  balanceDue?: number;
  deliveryCode?: string;
}
export interface DemoTable { number: number; capacity: number; status: "free" | "occupied" | "cleaning" | "partial"; people?: number; openedAt?: string; groupId?: string; tabs: DemoTab[]; }
export interface DemoTab { id: string; name: string; items: CartItem[]; paidCents: number; totalCents: number; serviceChargeRate?: number; serviceChargeApplied?: boolean; serviceChargeCents?: number; waiter: string; status: "open" | "partial" | "closed" | "cancelled"; }
export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  available: boolean;
  latitude?: number;
  longitude?: number;
  lastLocationAt?: string;
  activeOrderId?: string;
  shiftActive?: boolean;
  shiftStartedAt?: string;
  shiftEndedAt?: string;
}
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

export * from "./extended";