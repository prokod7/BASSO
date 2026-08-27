import { createAdminClient } from "@/lib/supabase/admin";
import { priceItemsWithRuntime } from "@/lib/server-menu-pricing";
import { findDeliveryZone } from "@/lib/delivery-zones";
import type { CartItem, OrderChannel } from "@/types";

export interface CommercialQuote {
  items: CartItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  couponCode?: string;
  coverageConfigurationPending: boolean;
}

export async function quoteCommercialTerms(input: {
  items: CartItem[];
  channel: OrderChannel;
  couponCode?: string;
  city?: string;
  district?: string;
  allowReward?: boolean;
}): Promise<CommercialQuote> {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado no servidor.");

  const priced = await priceItemsWithRuntime(db, input.items, input.channel, input.allowReward === true);
  const subtotal = priced.subtotal;
  let deliveryFee = 0;
  let coverageConfigurationPending = false;

  if (input.channel === "own_delivery") {
    const { data: zones, error } = await db
      .from("delivery_zones")
      .select("name,city,districts,fee_cents,minimum_order_cents,active")
      .eq("active", true)
      .is("deleted_at", null);
    if (error) throw error;
    if (!zones?.length) {
      coverageConfigurationPending = true;
      throw new Error("As taxas de entrega por bairro ainda não foram configuradas. Cadastre os bairros e valores no painel antes de aceitar entregas.");
    }

    const city = (input.city || "").trim();
    const district = (input.district || "").trim();
    if (!city) throw new Error("Selecione a cidade atendida para calcular a entrega.");
    if (!district) throw new Error("Selecione o bairro atendido para calcular a taxa de entrega.");

    const zone = findDeliveryZone(zones, district, city);
    if (!zone) throw new Error(`Não encontramos entrega configurada para “${district}”, ${city}. Confira a cidade e o bairro selecionados.`);
    if (subtotal < (zone.minimum_order_cents || 0)) {
      throw new Error(`Pedido mínimo da região não atingido: R$ ${((zone.minimum_order_cents || 0) / 100).toFixed(2).replace(".", ",")}.`);
    }
    deliveryFee = Number(zone.fee_cents || 0);
  }

  let discount = 0;
  let couponCode: string | undefined;
  if (input.couponCode) {
    const code = input.couponCode.trim().toUpperCase();
    const { data: coupon, error } = await db
      .from("coupons")
      .select("code,discount_type,value,total_limit,uses,minimum_cents,channels,starts_at,ends_at,active")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    const now = Date.now();
    if (
      !coupon ||
      !coupon.active ||
      (coupon.total_limit != null && coupon.uses >= coupon.total_limit) ||
      (coupon.minimum_cents != null && subtotal < coupon.minimum_cents) ||
      !coupon.channels.includes(input.channel) ||
      (coupon.starts_at && Date.parse(coupon.starts_at) > now) ||
      (coupon.ends_at && Date.parse(coupon.ends_at) < now)
    ) throw new Error("Cupom inválido, pausado, esgotado ou indisponível para este pedido.");
    discount = coupon.discount_type === "percentage" ? Math.round(subtotal * coupon.value / 100) : Math.min(subtotal, coupon.value);
    couponCode = coupon.code;
  }

  return {
    items: priced.items,
    subtotal,
    discount,
    deliveryFee,
    total: Math.max(0, subtotal - discount + deliveryFee),
    couponCode,
    coverageConfigurationPending,
  };
}
