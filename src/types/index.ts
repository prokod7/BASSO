export type PizzaCategory = "traditional" | "premium" | "sweet";
export type OrderChannel = "own_delivery" | "pickup" | "counter" | "dine_in" | "ifood" | "99food" | "table_qr";
export type OrderStatus = "received" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
export type PaymentStatus = "pending" | "partial" | "paid" | "refunded" | "cancelled";
export type PaymentMethod = "pix" | "cash" | "debit" | "credit" | "meal_voucher" | "food_voucher";

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
