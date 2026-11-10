import { randomUUID } from "node:crypto";
import { loadBusinessSettings } from "@/lib/business-settings";
import { createQuotedOrder, storeAcceptance } from "@/lib/checkout-order";
import { massName, pizzaOptions } from "@/lib/pizza-options";
import { loadRuntimeMenu, type RuntimeMenu } from "@/lib/server-menu-pricing";
import { quoteCommercialTerms } from "@/lib/server-quote";
import { loadPromotions } from "@/lib/promotions";
import type { OpeningHours } from "@/lib/opening-hours";
import type { Order, PromotionRecord } from "@/types";
import type { Zone } from "./catalog";
import type { Basket, Pending, Quote } from "./domain";
import { menuUrl } from "./menuMedia";
import type { PixAccount } from "./pix";

export type StoreInfo = { name: string; address: string; city: string; state: string; menuUrl: string; open: boolean; closedMessage: string; hours: string; openingHours?: OpeningHours | null };
export type BotContext = { menu: RuntimeMenu; zones: Zone[]; store: StoreInfo; pix: PixAccount; promotions?: PromotionRecord[] };

/** Cardápio vivo, bairros e dados da loja: o mesmo que o site usa. */
export async function loadBotContext(db: any): Promise<BotContext> {
  const [menu, zonesResult, business, settings, acceptance, promotions] = await Promise.all([
    loadRuntimeMenu(db),
    db.from("delivery_zones").select("name,city,districts,fee_cents,minimum_order_cents").eq("active", true).is("deleted_at", null),
    loadBusinessSettings(db),
    db.from("wa_settings").select("pix_name").eq("id", true).maybeSingle(),
    storeAcceptance(db),
    loadPromotions(db).catch(() => [] as PromotionRecord[]),
  ]);
  if (zonesResult.error) throw zonesResult.error;
  const address = business.address && typeof business.address === "object" ? business.address as Record<string, unknown> : {};
  const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
  return {
    menu,
    zones: (zonesResult.data || []).map((z: any) => ({ name: z.name, city: z.city, districts: z.districts || [], fee_cents: Number(z.fee_cents || 0), minimum_order_cents: Number(z.minimum_order_cents || 0) })),
    store: {
      name: text(business.name, "La Forneria Basso"),
      address: business.addressLabel,
      city: text(address.city, "Rio Grande da Serra"),
      state: text(address.state, "SP").slice(0, 2).toUpperCase(),
      menuUrl: menuUrl(),
      open: acceptance.accepting,
      closedMessage: acceptance.message,
      hours: business.hoursLabel || "",
      openingHours: business.openingHours || null,
    },
    promotions,
    pix: { pix_key: business.pixKey, pix_name: settings?.data?.pix_name || business.name || null },
  };
}

/** Nomes para o resumo (sempre do cardápio vivo, com os rótulos gravados no item como reserva). */
export function namesFor(menu: RuntimeMenu, basket: Basket) {
  const labels = Object.assign({}, ...basket.items.map((i) => (i.selection as { labels?: Record<string, string> } | undefined)?.labels || {}));
  return {
    flavor: (id: string) => menu.flavors.find((f) => f.id === id)?.name || labels[id] || id,
    addon: (id: string) => menu.addons.find((a) => a.id === id)?.name || labels[id] || id,
    product: (id: string) => menu.products.find((p) => p.id === id)?.name || labels[id] || id,
    massName: (id: string) => massName(id),
    hazelnut: pizzaOptions().hazelnut.name,
  };
}

/** Cotação oficial (mesma do checkout do site): preços, promoções, cupom e taxa do bairro. */
export async function quoteBasket(basket: Basket): Promise<{ quote: Quote; basket: Basket }> {
  const result = await quoteCommercialTerms({
    items: basket.items,
    channel: basket.channel,
    couponCode: basket.couponCode,
    city: basket.address?.city,
    district: basket.address?.district,
  });
  return {
    quote: { subtotal: result.subtotal, discount: result.discount, deliveryFee: result.deliveryFee, total: result.total },
    basket: { ...basket, items: result.items, couponCode: result.couponCode },
  };
}

export class PriceChangedError extends Error {
  constructor() { super("PRICE_CHANGED"); this.name = "PriceChangedError"; }
}

/**
 * Grava o pedido confirmado pelo cliente. Recalcula tudo; se o total mudou desde o resumo,
 * não grava (PRICE_CHANGED). Idempotente pela chave do resumo: repetir não duplica.
 */
export async function placeWhatsAppOrder(db: any, pending: Pending, opts: { pixReceipt?: string } = {}) {
  const basket = pending.basket;
  if (!opts.pixReceipt) {
    // Com Pix já pago, o pedido entra mesmo que a loja tenha fechado nesse meio-tempo.
    const store = await storeAcceptance(db);
    if (!store.accepting) throw new Error(store.message || "A loja está fechada no momento.");
  }
  const priced = await quoteCommercialTerms({ items: basket.items, channel: basket.channel, couponCode: basket.couponCode, city: basket.address?.city, district: basket.address?.district });
  if (priced.total !== pending.quote.total) throw new PriceChangedError();
  const now = new Date().toISOString();
  const notes = opts.pixReceipt ? `Pedido pelo WhatsApp. Pix: comprovante conferido pela IA (${opts.pixReceipt}). Confirme o recebimento no banco.` : "Pedido pelo WhatsApp.";
  const order: Order = {
    id: randomUUID(), number: 1, channel: basket.channel, status: "received", paymentStatus: "pending",
    customerName: basket.customerName, customerPhone: basket.customerPhone, address: basket.address,
    items: priced.items, subtotal: priced.subtotal, discount: priced.discount, deliveryFee: priced.deliveryFee, total: priced.total,
    paymentMethod: basket.paymentMethod, changeFor: basket.paymentMethod === "cash" ? basket.changeFor : undefined,
    notes: notes.slice(0, 500), couponCode: priced.couponCode, createdAt: now, updatedAt: now,
    sourceIdempotencyKey: basket.idempotencyKey, origin: "whatsapp",
  };
  const created = await createQuotedOrder(db, order, priced);
  return { id: created.id, number: created.number };
}
