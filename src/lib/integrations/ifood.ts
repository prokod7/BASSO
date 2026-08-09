import { createHmac, timingSafeEqual } from "crypto";
import { jsonRequest } from "@/lib/integrations/http";
import type { ExternalOrder, MarketplaceAdapter } from "@/lib/integrations/types";
import type { OrderStatus, PaymentMethod } from "@/types";

const DEFAULT_BASE_URL = "https://merchant-api.ifood.com.br";

export type IfoodWebhookEvent = {
  id?: string;
  code?: string;
  fullCode?: string;
  merchantId?: string;
  merchantIds?: string[];
  orderId?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type IfoodCancellationReason = {
  code: string;
  description: string;
};

export type IfoodConfig = {
  clientId?: string;
  clientSecret?: string;
  merchantId?: string;
  baseUrl?: string;
};

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.trim().toLowerCase(), "utf8");
  const right = Buffer.from(b.trim().toLowerCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyIfoodWebhookSignature(rawBody: string, signature: string | null, clientSecret: string): boolean {
  if (!signature || !clientSecret) return false;
  const expected = createHmac("sha256", clientSecret).update(Buffer.from(rawBody, "utf8")).digest("hex");
  return safeEqual(signature, expected);
}

export function ifoodEventCode(event: IfoodWebhookEvent): string {
  return String(event.fullCode || event.code || "UNKNOWN").trim().toUpperCase();
}

export function isIfoodKeepalive(event: IfoodWebhookEvent): boolean {
  return ifoodEventCode(event) === "KEEPALIVE";
}

export function ifoodOrderId(event: IfoodWebhookEvent): string | null {
  // No webhook oficial, `id` identifica o evento e `orderId` identifica o pedido.
  // Nunca use o ID do evento para consultar a API de pedidos.
  const value = event.orderId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function money(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + money(item), 0);
  // A API de pedidos do iFood envia valores em reais (ex.: 27 = R$ 27,00).
  // O PedidoPro armazena todos os valores como centavos inteiros.
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return money(record.value ?? record.amount ?? record.total ?? 0);
  }
  return 0;
}

function mapPayment(method: string | undefined): PaymentMethod {
  const normalized = (method || "").toUpperCase();
  if (normalized.includes("PIX")) return "pix";
  if (normalized.includes("CASH")) return "cash";
  if (normalized.includes("DEBIT")) return "debit";
  if (normalized.includes("MEAL")) return "meal_voucher";
  if (normalized.includes("FOOD")) return "food_voucher";
  return "credit";
}

function deliveredByMerchant(order: Record<string, any>): boolean {
  const deliveredBy = String(
    order.delivery?.deliveredBy ||
      order.delivery?.provider ||
      order.delivery?.deliveryBy ||
      "",
  ).toUpperCase();
  return deliveredBy === "MERCHANT" || deliveredBy === "RESTAURANT";
}

function normalizeAddress(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const address = value as Record<string, any>;
  const coordinates = address.coordinates || {};
  const street = address.street || address.streetName || address.formattedAddress || "";
  const number = address.number || address.streetNumber || "S/N";
  const district = address.district || address.neighborhood || "Não informado";
  const city = address.city || "Não informado";
  const state = String(address.state || "").slice(0, 2).toUpperCase();
  return {
    cep: String(address.cep || address.postalCode || ""),
    street: String(street),
    number: String(number),
    district: String(district),
    complement: address.complement ? String(address.complement) : undefined,
    reference: address.reference ? String(address.reference) : undefined,
    city: String(city),
    state,
    latitude: typeof coordinates.latitude === "number" ? coordinates.latitude : address.latitude,
    longitude: typeof coordinates.longitude === "number" ? coordinates.longitude : address.longitude,
  };
}

export class IfoodAdapter implements MarketplaceAdapter {
  readonly provider = "ifood" as const;
  private token?: { value: string; expiresAt: number };
  private readonly config: Required<IfoodConfig>;

  constructor(config: IfoodConfig = {}) {
    this.config = {
      clientId: config.clientId ?? process.env.IFOOD_CLIENT_ID ?? "",
      clientSecret: config.clientSecret ?? process.env.IFOOD_CLIENT_SECRET ?? "",
      merchantId: config.merchantId ?? process.env.IFOOD_MERCHANT_ID ?? "",
      baseUrl: (config.baseUrl ?? process.env.IFOOD_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
    };
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    return verifyIfoodWebhookSignature(rawBody, headers.get("x-ifood-signature"), this.config.clientSecret);
  }

  private assertCredentials(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Credenciais do iFood não configuradas.");
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    this.assertCredentials();
    const body = new URLSearchParams({
      grantType: "client_credentials",
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    });
    const result = await jsonRequest<{ accessToken: string; expiresIn?: number }>(
      `${this.config.baseUrl}/authentication/v1.0/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );
    if (!result?.accessToken) throw new Error("O iFood não retornou um token de acesso.");
    this.token = {
      value: result.accessToken,
      expiresAt: Date.now() + Math.max(60, Number(result.expiresIn || 300)) * 1000,
    };
    return this.token.value;
  }

  private async call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return jsonRequest<T>(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        ...(init.headers || {}),
      },
    });
  }

  async getOrder(id: string): Promise<Record<string, any>> {
    return this.call<Record<string, any>>(`/order/v1.0/orders/${encodeURIComponent(id)}`);
  }

  normalizeOrder(payload: unknown): ExternalOrder {
    const root = (payload || {}) as Record<string, any>;
    const order = (root.order || root) as Record<string, any>;
    const methods = Array.isArray(order.payments?.methods) ? order.payments.methods : [];
    const items = (Array.isArray(order.items) ? order.items : []).map((item: Record<string, any>, index: number) => ({
      externalId: String(item.id || item.uniqueId || `${order.id || "order"}-${index + 1}`),
      externalProductId: item.productId ? String(item.productId) : undefined,
      name: String(item.name || "Item iFood"),
      quantity: Math.max(1, Number(item.quantity || 1)),
      unitPriceCents: money(item.unitPrice ?? item.price ?? item.totalPrice),
      options: (Array.isArray(item.options) ? item.options : []).map((option: Record<string, any>) => ({
        externalId: option.id ? String(option.id) : undefined,
        name: String(option.name || "Complemento"),
        quantity: Math.max(1, Number(option.quantity || 1)),
        priceCents: money(option.unitPrice ?? option.price ?? option.addition),
      })),
      notes: item.observations || item.notes || undefined,
    }));
    const method = methods[0] || {};
    const prepaid = typeof order.payments?.prepaid === "boolean"
      ? order.payments.prepaid
      : methods.length > 0 && methods.every((entry: Record<string, any>) => String(entry.type || "").toUpperCase() === "ONLINE");

    return {
      provider: "ifood",
      externalId: String(order.id || ""),
      displayId: String(order.displayId || order.shortReference || order.id || ""),
      createdAt: order.createdAt || new Date().toISOString(),
      customerDisplayName: order.customer?.name || "Cliente iFood",
      customerPhone: order.customer?.phone?.number || undefined,
      deliveryAddress: normalizeAddress(order.delivery?.deliveryAddress || order.deliveryAddress),
      orderType: String(order.orderType || "DELIVERY").toUpperCase(),
      deliveredBy: String(order.delivery?.deliveredBy || order.delivery?.provider || "").toUpperCase() || undefined,
      scheduled: Boolean(order.schedule?.scheduledDateTime || order.scheduling?.deliveryDateTime),
      notes: order.additionalInfo || order.observations || undefined,
      items,
      subtotalCents: money(order.total?.subTotal ?? order.subtotal),
      deliveryFeeCents:
        money(order.total?.deliveryFee ?? order.deliveryFee) +
        money(order.total?.additionalFees ?? order.additionalFees),
      discountCents: money(order.total?.benefits ?? order.benefits ?? order.discount),
      totalCents: money(order.total?.orderAmount ?? order.totalAmount),
      paymentMethod: mapPayment(method.method || method.name),
      paid: prepaid,
      raw: order,
    };
  }

  async acceptOrder(id: string): Promise<void> {
    await this.call(`/order/v1.0/orders/${encodeURIComponent(id)}/confirm`, { method: "POST", body: "{}" });
  }

  async rejectOrder(id: string, reason: string, cancellationCode?: string): Promise<void> {
    await this.cancelOrder(id, reason, cancellationCode);
  }

  async cancellationReasons(id: string): Promise<IfoodCancellationReason[]> {
    const result = await this.call<unknown>(`/order/v1.0/orders/${encodeURIComponent(id)}/cancellationReasons`);
    const rows = Array.isArray(result) ? result : Array.isArray((result as any)?.reasons) ? (result as any).reasons : [];
    return rows
      .map((row: Record<string, any>) => ({
        code: String(row.code || row.id || row.cancellationCode || ""),
        description: String(row.description || row.reason || row.message || row.name || "Motivo informado pelo iFood"),
      }))
      .filter((row: IfoodCancellationReason) => row.code);
  }

  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    if (status === "received" || status === "completed" || status === "cancelled") return;
    if (status === "confirmed") return this.acceptOrder(id);
    if (status === "preparing") {
      await this.call(`/order/v1.0/orders/${encodeURIComponent(id)}/startPreparation`, { method: "POST", body: "{}" });
      return;
    }
    if (status === "ready") {
      await this.call(`/order/v1.0/orders/${encodeURIComponent(id)}/readyToPickup`, { method: "POST", body: "{}" });
      return;
    }
    if (status === "out_for_delivery") {
      const order = await this.getOrder(id);
      if (!deliveredByMerchant(order)) {
        throw new Error("Esta entrega é realizada pelo iFood. Aguarde o evento de retirada do entregador.");
      }
      await this.call(`/order/v1.0/orders/${encodeURIComponent(id)}/dispatch`, { method: "POST", body: "{}" });
    }
  }

  async cancelOrder(id: string, reason: string, cancellationCode?: string): Promise<void> {
    if (!cancellationCode) throw new Error("Selecione um motivo de cancelamento fornecido pelo iFood.");
    await this.call(`/order/v1.0/orders/${encodeURIComponent(id)}/requestCancellation`, {
      method: "POST",
      body: JSON.stringify({ cancellationCode, reason }),
    });
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.accessToken();
      if (!this.config.merchantId) return { ok: false, detail: "Informe o IFOOD_MERCHANT_ID." };
      const merchant = await this.call<Record<string, any>>(`/merchant/v1.0/merchants/${encodeURIComponent(this.config.merchantId)}`);
      return { ok: true, detail: `Autenticado na loja ${merchant.name || merchant.corporateName || this.config.merchantId}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "Falha desconhecida" };
    }
  }
}
