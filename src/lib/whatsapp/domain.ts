import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import type { Address, CartItem, ComboSelection, PizzaSelection } from "@/types";

export type WaPaymentMethod = "pix" | "cash" | "credit" | "debit" | "meal_voucher" | "food_voucher";
export const WA_PAYMENT_METHODS: WaPaymentMethod[] = ["pix", "cash", "credit", "debit", "meal_voucher", "food_voucher"];

/** Pedido montado pelo robô, no formato do checkout público. Preços sempre do servidor. */
export type Basket = {
  channel: "own_delivery" | "pickup";
  customerName: string;
  customerPhone: string;
  paymentMethod: WaPaymentMethod;
  changeFor?: number;
  couponCode?: string;
  address?: Address;
  items: CartItem[];
  idempotencyKey: string;
};
export type Quote = { subtotal: number; discount: number; deliveryFee: number; total: number };
export type Pending = {
  basket: Basket;
  quote: Quote;
  summary: string;
  code: string;
  expires: string;
  /** Pix: o cliente confirmou; o pedido só entra depois do comprovante conferido. */
  awaiting_receipt?: boolean;
  receipt_attempts?: number;
};

export const ALLOWANCE = 2000;

export function secretMatches(a: string, b: string) {
  return !!a && !!b && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function usage(delivered: number) {
  return { delivered, included: Math.min(delivered, ALLOWANCE), remaining: Math.max(0, ALLOWANCE - delivered), excess: Math.max(0, delivered - ALLOWANCE) };
}

export function monthStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-01T00:00:00-03:00`;
}

export function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}

// Palavras de "pode mandar". Todas precisam estar nas listas e ao menos uma ser um "sim":
// "sim, mas sem cebola" ou "não" nunca confirmam.
const YES = new Set("sim s ss isso ok okay blz beleza pode confirmar confirmo confirmado confirma confirmada fechado fecha fechou fechar correto certo certinho perfeito show bora top manda mandar envia enviar positivo uhum aham claro exato".split(" "));
const FILLER = new Set("o a e ai entao ja ta esta tudo mesmo ser pedido pode por favor obrigado obrigada valeu vlw pfv pf pra para meu minha amigo moca querida".split(" "));

export function affirmative(text: string) {
  const raw = text.trim();
  if (!raw || raw.length > 60) return false;
  if (/^(👍|✅|👌|🙏|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿)+$/u.test(raw)) return true;
  const words = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 && words.some((w) => YES.has(w)) && words.every((w) => YES.has(w) || FILLER.has(w));
}

export function confirmation(text: string, pending: Pending | null, now = Date.now()) {
  if (!pending || pending.awaiting_receipt || Date.parse(pending.expires) <= now) return false;
  const t = text.replace(/\*/g, "").trim();
  return t.toUpperCase() === `CONFIRMAR ${pending.code}` || affirmative(t);
}

export type BatchJob = {
  payload: { text?: { body: string }; interactive?: { button_reply?: { id: string } } };
  order_result: unknown;
};
const rawText = (job: BatchJob) => job.payload.text?.body ?? job.payload.interactive?.button_reply?.id ?? "";

/**
 * Mensagem principal do lote: um resultado de pedido já gravado; senão uma confirmação
 * enviada antes de qualquer outro texto (as seguintes voltam para a fila); senão a mais nova.
 * Texto antes da confirmação pode ser alteração, então gera novo resumo.
 */
export function pickLead<T extends BatchJob>(jobs: T[], pending: Pending | null) {
  const committed = jobs.find((j) => j.order_result);
  if (committed) return { lead: committed, confirm: false };
  const index = jobs.findIndex((j) => confirmation(rawText(j), pending));
  if (index >= 0 && jobs.slice(0, index).every((j) => confirmation(rawText(j), pending))) return { lead: jobs[index], confirm: true };
  return { lead: jobs[jobs.length - 1], confirm: false };
}

/** Nunca mostrar detalhes internos (ex.: JSON do Zod) ao cliente. */
export function friendlyError(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message?.replace(/\.$/, "") || "confira os dados";
  const message = error instanceof Error ? error.message : "";
  if (!message || /^[\[{]/.test(message.trim())) return "confira os dados";
  return message.replace(/\.$/, "");
}

/** Telefone salvo no pedido (DDD + número) e id do WhatsApp (55 + …). */
export function phoneVariants(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
  return [...new Set([digits, local, `55${local}`])];
}
export function localPhone(waPhone: string) {
  const digits = waPhone.replace(/\D/g, "");
  return digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
}
export function waPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

export type RecentOrder = {
  number: number;
  daily_number: number | null;
  channel: string;
  status: string;
  estimated_ready_at: string | null;
  created_at: string;
  total_cents: number;
};
export const RECENT_ORDER_FIELDS = "number,daily_number,channel,status,estimated_ready_at,created_at,total_cents";
export const ACTIVE_STATUSES = ["received", "confirmed", "preparing", "ready", "out_for_delivery"];
const STATUS_TEXT: Record<string, string> = {
  received: "recebido, aguardando a loja confirmar",
  confirmed: "confirmado pela loja, vai para o forno",
  preparing: "em preparo",
  out_for_delivery: "saiu para entrega",
  cancelled: "cancelado",
};

/** Status real dos pedidos recentes do cliente, para "cadê meu pedido?". */
export function ordersContext(orders: RecentOrder[], now = Date.now()) {
  if (!orders.length) return "";
  const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const lines = orders.map((o) => {
    const delivery = o.channel === "own_delivery";
    const status = o.status === "ready"
      ? delivery ? "pronto, aguardando o entregador sair" : "pronto para retirada"
      : o.status === "completed" ? delivery ? "entregue" : "finalizado" : STATUS_TEXT[o.status] ?? o.status;
    const forecast = o.estimated_ready_at && ACTIVE_STATUSES.includes(o.status)
      ? Date.parse(o.estimated_ready_at) > now ? `; previsão ${time(o.estimated_ready_at)}` : "; já passou da previsão"
      : "";
    return `nº ${o.daily_number ?? o.number} (${delivery ? "entrega" : "retirada"}, ${money(o.total_cents)}, feito às ${time(o.created_at)}): ${status}${forecast}`;
  });
  return `PEDIDOS DO CLIENTE (status real agora, use se ele perguntar do pedido):\n${lines.join("\n")}`;
}

type Names = { flavor: (id: string) => string; addon: (id: string) => string; product: (id: string) => string; massName: (id: string) => string; hazelnut: string };

const PAYMENT_TEXT: Record<WaPaymentMethod, string> = {
  pix: "Pix (a chave vai logo após você confirmar)",
  cash: "Dinheiro",
  credit: "Cartão de crédito (na entrega/retirada)",
  debit: "Cartão de débito (na entrega/retirada)",
  meal_voucher: "Vale-refeição (na maquininha, na entrega/retirada)",
  food_voucher: "Vale-alimentação (na maquininha, na entrega/retirada)",
};

function pizzaLines(selection: PizzaSelection, names: Names, showMass: boolean) {
  const lines: string[] = [];
  const a = names.flavor(selection.flavorA), b = selection.flavorB ? names.flavor(selection.flavorB) : "";
  const flavors = b ? `½ ${a} + ½ ${b}` : a;
  lines.push(flavors);
  if (showMass) lines.push(`   Massa ${names.massName(selection.mass).toLowerCase()}`);
  const place = (id: string) => selection.addonPlacements?.[id] || "whole";
  for (const [id, qty] of Object.entries(selection.addons || {})) {
    if (!qty) continue;
    const where = place(id) === "halfA" ? ` (só na metade ${a})` : place(id) === "halfB" ? ` (só na metade ${b})` : b ? " (pizza inteira)" : "";
    lines.push(`   + ${qty > 1 ? `${qty}x ` : ""}${names.addon(id)}${where}`);
  }
  for (const item of selection.removedA || []) lines.push(`   Sem ${item}${b ? ` (${a})` : ""}`);
  for (const item of selection.removedB || []) lines.push(`   Sem ${item} (${b})`);
  if (selection.sweetBase === "hazelnut-zero") lines.push(`   Base ${names.hazelnut}`);
  if (selection.cutPreference) lines.push(`   ${selection.cutPreference === "cut" ? "Cortada" : "Sem cortar"}`);
  return lines;
}

/** Resumo curto que o cliente confirma. Valores já calculados pelo servidor. */
export function summarize(basket: Basket, quote: Quote, names: Names, showMass: boolean) {
  const lines = ["📝 *Confira seu pedido:*", ""];
  for (const item of basket.items) {
    const selection = item.selection as (PizzaSelection & ComboSelection) | undefined;
    if (item.kind === "pizza" && selection && "flavorA" in selection) {
      const [first, ...rest] = pizzaLines(selection, names, showMass);
      lines.push(`🍕 *${item.quantity}x Pizza ${selection.size === "broto" ? "Broto" : "Grande"}* — ${first}`, ...rest);
    } else if (item.kind === "combo" && selection && "grandeFlavor" in selection) {
      const grande = selection.grandeFlavorB ? `½ ${names.flavor(selection.grandeFlavor)} + ½ ${names.flavor(selection.grandeFlavorB)}` : names.flavor(selection.grandeFlavor);
      lines.push(`🎁 *${item.quantity}x ${names.product(item.productId || "") || "Combo"}*`, `   Grande: ${grande}`);
      if (selection.secondGrandeFlavor) lines.push(`   Grande 2: ${selection.secondGrandeFlavorB ? `½ ${names.flavor(selection.secondGrandeFlavor)} + ½ ${names.flavor(selection.secondGrandeFlavorB)}` : names.flavor(selection.secondGrandeFlavor)}`);
      if (selection.sweetFlavor) lines.push(`   ${selection.sweetSize === "grande" ? "Grande" : "Broto"} doce: ${names.flavor(selection.sweetFlavor)}`);
      if (selection.beverage) lines.push(`   Bebida: ${names.product(selection.beverage)}`);
      if (showMass) lines.push(`   Massa ${names.massName(selection.mass).toLowerCase()}`);
    } else {
      lines.push(`${/bebida|refri|coca|suco|água|agua|cerveja|lata|vinho|long neck|guaran|fanta|sprite|h2oh|tônica|tonica/i.test(item.name) ? "🥤" : "▪️"} *${item.quantity}x ${item.name}*`);
    }
    if (selection?.notes) lines.push(`   Obs.: ${selection.notes}`);
    lines.push(`   ${money(item.unitPrice * item.quantity)}`);
  }
  lines.push("", `👤 ${basket.customerName}`);
  if (basket.channel === "own_delivery" && basket.address) {
    const a = basket.address;
    lines.push(`🛵 Entrega: ${a.street}, ${a.number}${a.complement ? ` (${a.complement})` : ""} — ${a.district}, ${a.city}`);
    if (a.reference) lines.push(`   Referência: ${a.reference}`);
  } else lines.push("🏠 Retirada na loja");
  lines.push(`💳 ${PAYMENT_TEXT[basket.paymentMethod]}${basket.paymentMethod === "cash" ? basket.changeFor ? ` · troco para ${money(basket.changeFor)}` : " · sem troco" : ""}`, "");
  if (basket.channel === "own_delivery") lines.push(`Taxa de entrega: ${quote.deliveryFee ? money(quote.deliveryFee) : "grátis"}`);
  if (quote.discount) lines.push(`Desconto${basket.couponCode ? ` (${basket.couponCode})` : ""}: −${money(quote.discount)}`);
  lines.push(`*Total: ${money(quote.total)}*`);
  const text = lines.join("\n");
  if (text.length > 3200) throw new Error("Pedido muito extenso. Vou chamar alguém da equipe para te ajudar");
  return text;
}
