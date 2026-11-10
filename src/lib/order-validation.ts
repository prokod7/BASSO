import { z } from "zod";
import type { OrderChannel, OrderStatus } from "@/types";

export const orderStatusSequence: OrderStatus[] = ["received", "confirmed", "preparing", "ready", "out_for_delivery", "completed"];
export const statusLabel: Record<OrderStatus, string> = {
  received: "Recebido", confirmed: "Confirmado", preparing: "Em preparo", ready: "Pronto", out_for_delivery: "Saiu para entrega", completed: "Concluído", cancelled: "Cancelado"
};
export const channelLabel: Record<OrderChannel, string> = {
  own_delivery: "Delivery próprio", pickup: "Retirada", counter: "Balcão", dine_in: "Salão", ifood: "iFood", "99food": "99Food", table_qr: "QR da mesa"
};
export function allowedStatuses(channel: OrderChannel): OrderStatus[] {
  return channel === "own_delivery" || channel === "ifood" || channel === "99food"
    ? orderStatusSequence
    : orderStatusSequence.filter(s => s !== "out_for_delivery");
}
export function nextStatus(current: OrderStatus, channel: OrderChannel): OrderStatus | null {
  if (current === "cancelled" || current === "completed") return null;
  const list = allowedStatuses(channel);
  const i = list.indexOf(current);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
}
export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2, "Informe o nome.").max(120),
  customerPhone: z.string().refine(value => value === "" || /^\d{10,13}$/.test(value), "Informe um telefone válido."),
  channel: z.enum(["own_delivery", "pickup", "table_qr"]),
  // Checkout público aceita somente métodos comuns. Vouchers/benefícios são exclusivos do PDV interno.
  paymentMethod: z.enum(["pix", "cash", "debit", "credit", "meal_voucher", "food_voucher"]),
  couponCode: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
  tableNumber: z.number().int().min(1).max(999).optional(),
  tabId: z.string().min(4).max(100).optional(),
  tabName: z.string().trim().max(120).optional(),
  address: z.object({
    cep: z.string().regex(/^(\d{8})?$/, "CEP inválido: use 8 números ou deixe em branco."), street: z.string().trim().min(2, "Informe a rua."), number: z.string().trim().min(1, "Informe o número da casa."), district: z.string().min(2, "Selecione o bairro."), complement: z.string().optional(), reference: z.string().optional(), city: z.string().min(2, "Selecione a cidade."), state: z.string().length(2, "UF inválida."), latitude: z.number().optional(), longitude: z.number().optional()
  }).optional()
}).superRefine((v, ctx) => {
  if (v.channel === "own_delivery") {
    if (!v.address) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["address"], message: "Endereço obrigatório para entrega." });
    if (!v.customerPhone) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerPhone"], message: "Telefone obrigatório para entrega." });
  }
  if (v.channel === "pickup" && !v.customerPhone) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerPhone"], message: "Telefone obrigatório para retirada." });
  if (v.channel === "table_qr") {
    if (!v.tableNumber) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tableNumber"], message: "Mesa inválida. Leia novamente o QR Code." });
    if (!v.tabId && (!v.tabName || v.tabName.trim().length < 2)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tabName"], message: "Informe o nome da comanda ou participante." });
  }
});