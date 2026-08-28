import type { OrderChannel, PaymentMethod } from "@/types";

export type FiscalSource = "cardapio" | "pdv" | "mesa" | "ifood" | "99food" | "other";
export type FiscalFulfillment = "delivery" | "pickup" | "dine_in" | "counter" | "other";
export type FiscalPaymentMethod = "pix" | "cash" | "debit" | "credit" | "other";

export function mapOrderSource(channel: OrderChannel, orderOrigin?: string | null): FiscalSource {
  if (channel === "ifood") return "ifood";
  if (channel === "99food") return "99food";
  if (channel === "table_qr") return "mesa";

  if (["counter", "whatsapp", "phone"].includes(orderOrigin || "")) return "pdv";
  if (orderOrigin === "table") return "mesa";
  if (orderOrigin === "web" && ["own_delivery", "pickup"].includes(channel)) return "cardapio";

  if (["counter", "dine_in"].includes(channel)) return "pdv";
  if (["own_delivery", "pickup"].includes(channel)) return "cardapio";
  return "other";
}

export function mapFulfillment(channel: OrderChannel): FiscalFulfillment {
  if (channel === "own_delivery") return "delivery";
  if (channel === "pickup") return "pickup";
  if (channel === "counter") return "counter";
  if (channel === "dine_in" || channel === "table_qr") return "dine_in";

  // O banco principal ainda não possui uma coluna normalizada de modalidade
  // para marketplaces. Não inferimos informação fiscal a partir do payload bruto.
  return "other";
}

export function mapFiscalPaymentMethod(method: PaymentMethod): FiscalPaymentMethod {
  if (method === "pix" || method === "cash" || method === "debit" || method === "credit") return method;
  return "other";
}

export function paymentMethodsForFilter(method: FiscalPaymentMethod): PaymentMethod[] {
  if (method === "other") return ["meal_voucher", "food_voucher"];
  return [method];
}
