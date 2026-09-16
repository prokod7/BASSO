import type { PaymentMethod, PaymentMethodLiteral } from "@/types";

export const publicPaymentMethods = ["pix", "cash", "debit", "credit"] as const satisfies readonly PaymentMethodLiteral[];

export const pdvPaymentMethods = [
  "cash",
  "pix",
  "debit",
  "credit",
  "vr_refeicao",
  "vr_alimentacao",
  "sodexo",
  "pluxe",
  "alelo_refeicao",
  "ticket_restaurante",
  "voucher",
] as const satisfies readonly PaymentMethodLiteral[];

export const legacyPaymentMethods = ["meal_voucher", "food_voucher"] as const satisfies readonly PaymentMethodLiteral[];

const canonicalPaymentMethodLabels = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  meal_voucher: "Vale-refeição (legado)",
  food_voucher: "Vale-alimentação (legado)",
  vr_refeicao: "VR Refeição",
  vr_alimentacao: "VR Alimentação",
  sodexo: "Sodexo",
  pluxe: "Pluxe",
  alelo_refeicao: "Alelo Refeição",
  ticket_restaurante: "Ticket Restaurante",
  voucher: "Voucher",
} satisfies Record<PaymentMethodLiteral, string>;

// Indexável por métodos persistidos/importados; todos os métodos que o app grava
// continuam obrigatoriamente enumerados no mapa canônico acima.
export const paymentMethodLabels: Readonly<Record<string, string>> = canonicalPaymentMethodLabels;

export function isPublicPaymentMethod(value: unknown): value is PaymentMethodLiteral {
  return typeof value === "string" && (publicPaymentMethods as readonly string[]).includes(value);
}

export function isPdvPaymentMethod(value: unknown): value is PaymentMethodLiteral {
  return typeof value === "string" && (pdvPaymentMethods as readonly string[]).includes(value);
}

export function isCashPayment(method: PaymentMethod) {
  return method === "cash";
}
