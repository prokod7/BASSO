import type { OrderChannel, OrderStatus, PaymentMethod } from "@/types";

export interface ExternalOrderItem {
  externalId: string;
  externalProductId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  options: Array<{ externalId?: string; name: string; quantity: number; priceCents: number }>;
  notes?: string;
}
export interface ExternalOrder {
  provider: "ifood" | "99food";
  externalId: string;
  displayId: string;
  createdAt: string;
  customerDisplayName: string;
  customerPhone?: string;
  deliveryAddress?: Record<string, unknown>;
  items: ExternalOrderItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paid: boolean;
  raw: unknown;
}
export interface ProductMapping { provider: string; externalId: string; internalId: string; kind: "flavor" | "product" | "addon" | "combo"; }
export interface MarketplaceAdapter {
  provider: "ifood" | "99food";
  verifyWebhook(rawBody: string, headers: Headers): Promise<boolean> | boolean;
  normalizeOrder(payload: unknown): ExternalOrder;
  acceptOrder(externalId: string): Promise<void>;
  rejectOrder(externalId: string, reason: string): Promise<void>;
  updateStatus(externalId: string, status: OrderStatus): Promise<void>;
  cancelOrder(externalId: string, reason: string): Promise<void>;
  health(): Promise<{ ok: boolean; detail: string }>;
}
export interface CardTransactionRequest { amountCents: number; method: Extract<PaymentMethod,"debit"|"credit"|"meal_voucher"|"food_voucher">; installments?: number; reference: string; terminalId: string; }
export interface CardTransactionResult { approved: boolean; externalId: string; authorizationCode?: string; reason?: string; raw: unknown; }
export interface CardTerminalAdapter {
  charge(request: CardTransactionRequest): Promise<CardTransactionResult>;
  cancel(externalId: string, amountCents: number): Promise<CardTransactionResult>;
  refund(externalId: string, amountCents: number): Promise<CardTransactionResult>;
  health(): Promise<{ ok: boolean; detail: string }>;
}
export const internalChannelForProvider = (provider: "ifood"|"99food"): OrderChannel => provider;
