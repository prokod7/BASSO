import type { AppliedPromotion, OrderChannel, PizzaSelection, PromotionRecord, PromotionRuntimeStatus } from "@/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function saoPauloClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekday = Math.max(0, WEEKDAYS.indexOf(map.weekday as (typeof WEEKDAYS)[number]));
  return {
    weekday,
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}

function toMinutes(value?: string) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function promotionRuntimeStatus(promotion: PromotionRecord, date = new Date()): PromotionRuntimeStatus {
  if (!promotion.active) return "inactive";
  if (promotion.paused) return "paused";

  const clock = saoPauloClock(date);
  if (promotion.startsOn && clock.date < promotion.startsOn) return "scheduled";
  if (promotion.endsOn && clock.date > promotion.endsOn) return "ended";

  const start = toMinutes(promotion.startTime);
  const end = toMinutes(promotion.endTime);
  let effectiveWeekday = clock.weekday;
  let timeAllowed = true;

  if (start != null && end != null) {
    if (start <= end) {
      timeAllowed = clock.minutes >= start && clock.minutes <= end;
    } else {
      timeAllowed = clock.minutes >= start || clock.minutes <= end;
      if (clock.minutes <= end) effectiveWeekday = (clock.weekday + 6) % 7;
    }
  } else if (start != null) {
    timeAllowed = clock.minutes >= start;
  } else if (end != null) {
    timeAllowed = clock.minutes <= end;
  }

  if (!promotion.daysOfWeek.includes(effectiveWeekday) || !timeAllowed) return "scheduled";
  return "active";
}

export function promotionIsActive(promotion: PromotionRecord, channel: OrderChannel, date = new Date()) {
  // Balcão do PDV é retirada na loja: vale a promoção de retirada.
  const allowed = promotion.channels.includes(channel) || (channel === "counter" && promotion.channels.includes("pickup"));
  return allowed && promotionRuntimeStatus(promotion, date) === "active";
}

function mapPromotionRow(row: any, targets: any[]): PromotionRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    badgeText: row.badge_text || "Promoção do dia",
    image: row.image_url || undefined,
    promoPrice: Number(row.promo_price_cents || 0),
    active: Boolean(row.active),
    paused: Boolean(row.paused),
    channels: row.channels || [],
    daysOfWeek: (row.days_of_week || []).map(Number),
    startsOn: row.starts_on || undefined,
    endsOn: row.ends_on || undefined,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : undefined,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : undefined,
    pizzaSize: row.pizza_size || undefined,
    allowCouponStack: Boolean(row.allow_coupon_stack),
    sortOrder: Number(row.sort_order || 0),
    targets: targets
      .filter(target => target.promotion_id === row.id)
      .map(target => ({
        id: target.id,
        productId: target.product_id || undefined,
        flavorId: target.flavor_id || undefined,
      })),
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

export async function loadPromotions(db: any): Promise<PromotionRecord[]> {
  const [{ data: rows, error }, { data: targets, error: targetError }] = await Promise.all([
    db.from("promotions")
      .select("id,name,description,badge_text,image_url,promo_price_cents,active,paused,channels,days_of_week,starts_on,ends_on,start_time,end_time,pizza_size,allow_coupon_stack,sort_order,created_at,updated_at")
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    db.from("promotion_targets").select("id,promotion_id,product_id,flavor_id"),
  ]);
  if (error) throw error;
  if (targetError) throw targetError;
  return (rows || []).map((row: any) => mapPromotionRow(row, targets || []));
}

export async function loadActivePromotions(db: any, channel: OrderChannel, date = new Date()) {
  const promotions = await loadPromotions(db);
  return promotions
    .filter(promotion => promotionIsActive(promotion, channel, date))
    .sort((a, b) => a.promoPrice - b.promoPrice || a.sortOrder - b.sortOrder);
}

function toAppliedPromotion(promotion: PromotionRecord, originalUnitPrice: number, promoUnitPrice: number): AppliedPromotion {
  return {
    id: promotion.id,
    name: promotion.name,
    badgeText: promotion.badgeText,
    image: promotion.image,
    originalUnitPrice,
    promoUnitPrice,
    allowCouponStack: promotion.allowCouponStack,
  };
}

export function bestProductPromotion(
  promotions: PromotionRecord[],
  productId: string,
  originalUnitPrice: number,
): AppliedPromotion | undefined {
  const candidates = promotions.filter(promotion =>
    promotion.targets.some(target => target.productId === productId) && promotion.promoPrice < originalUnitPrice,
  );
  if (!candidates.length) return undefined;
  const promotion = candidates.reduce((best, current) => current.promoPrice < best.promoPrice ? current : best);
  return toAppliedPromotion(promotion, originalUnitPrice, promotion.promoPrice);
}

export function bestPizzaPromotion(
  promotions: PromotionRecord[],
  selection: PizzaSelection,
  originalUnitPrice: number,
  addonPriceCents: number,
): AppliedPromotion | undefined {
  const flavorIds = [selection.flavorA, selection.flavorB].filter((value): value is string => Boolean(value));
  const candidates = promotions.filter(promotion => {
    if (promotion.pizzaSize && promotion.pizzaSize !== selection.size) return false;
    const allowedFlavors = new Set(promotion.targets.map(target => target.flavorId).filter((value): value is string => Boolean(value)));
    return allowedFlavors.size > 0 && flavorIds.every(flavorId => allowedFlavors.has(flavorId));
  });
  if (!candidates.length) return undefined;

  const promotion = candidates.reduce((best, current) => current.promoPrice < best.promoPrice ? current : best);
  const promoUnitPrice = promotion.promoPrice + Math.max(0, addonPriceCents);
  if (promoUnitPrice >= originalUnitPrice) return undefined;
  return toAppliedPromotion(promotion, originalUnitPrice, promoUnitPrice);
}
